/**
 * Replenishment Suggestion Service
 *
 * 智能补货建议引擎，基于 EMA 日均消耗 + 在途冲抵 + 安全库存计算补货建议。
 *
 * 核心流程：
 * 1. 查询所有 inventory_items（含 quantity, minStock）
 * 2. 对每个 (sku, warehouseId) 查询出库历史，计算 EMA 日均消耗
 * 3. 获取在途数量（调拨在途 + 采购在途）
 * 4. 计算 targetStock = max(safetyStock, dailyConsumption × coverDays)
 * 5. 若 currentStock + inTransitQty < targetStock，生成补货建议
 * 6. 事务内：旧 pending 标记为 ignored，批量 INSERT 新建议
 */

import Database from 'better-sqlite3';
import { initDb, createTransferOrder } from '../db.js';
import { computeEMA } from './predictionService.js';
import { generateTransferNo } from './transferService.js';
import type {
  ReplenishmentSuggestion,
  ReplenishmentSuggestionRow,
  ReplenishmentConfig,
  SourceRecommendation,
} from '../models/wms-skill.js';
import { DEFAULT_REPLENISHMENT_CONFIG, replenishmentRowToModel } from '../models/wms-skill.js';

// ===================== InTransitAggregator =====================

/** 查询调拨在途数量：按 (sku, toWarehouseId) 聚合 */
function getTransferInTransit(db: Database.Database): Map<string, number> {
  const rows = db.prepare(`
    SELECT sku, toWarehouseId, SUM(quantity) AS qty
    FROM transfer_orders
    WHERE status IN ('submitted', 'in_transit')
    GROUP BY sku, toWarehouseId
  `).all() as Array<{ sku: string; toWarehouseId: string; qty: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.sku}|${row.toWarehouseId}`;
    map.set(key, (map.get(key) ?? 0) + row.qty);
  }
  return map;
}

/** 查询采购在途数量：按 (sku, warehouseId) 聚合 */
function getPurchaseInTransit(db: Database.Database): Map<string, number> {
  const rows = db.prepare(`
    SELECT sku, warehouseId, SUM(quantity) AS qty
    FROM inbound_records
    WHERE status != 'completed'
    GROUP BY sku, warehouseId
  `).all() as Array<{ sku: string; warehouseId: string; qty: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.sku}|${row.warehouseId}`;
    map.set(key, (map.get(key) ?? 0) + row.qty);
  }
  return map;
}

/** 合并调拨在途 + 采购在途，key 格式 "sku|warehouseId" */
function getAllInTransit(db: Database.Database): Map<string, number> {
  const transferMap = getTransferInTransit(db);
  const purchaseMap = getPurchaseInTransit(db);

  const merged = new Map<string, number>(transferMap);
  for (const [key, qty] of purchaseMap) {
    merged.set(key, (merged.get(key) ?? 0) + qty);
  }
  return merged;
}

// ===================== Priority Calculation =====================

/** 计算补货优先级 */
function calculatePriority(
  daysUntilZero: number,
  currentStock: number,
  inTransitQty: number,
  targetStock: number,
): 'critical' | 'high' | 'medium' | 'low' {
  const availableStock = currentStock + inTransitQty;

  // 紧急：当前库存 ≤ 0 或预计归零 ≤ 3 天
  if (currentStock <= 0 || daysUntilZero <= 3) {
    return 'critical';
  }

  // 高：预计归零 ≤ 7 天
  if (daysUntilZero <= 7) {
    return 'high';
  }

  // 中：预计归零 ≤ 14 天或可用库存低于目标库存
  if (daysUntilZero <= 14 || availableStock < targetStock) {
    return 'medium';
  }

  // 低：其他
  return 'low';
}

// ===================== Core Methods =====================

/**
 * 生成补货建议
 *
 * @param config - 补货配置（可选，覆盖默认值）
 * @returns 新创建的建议数量和建议列表
 */
export function generateSuggestions(
  config?: Partial<ReplenishmentConfig>,
): { created: number; suggestions: ReplenishmentSuggestion[] } {
  const db = initDb();
  const cfg: ReplenishmentConfig = {
    coverDays: config?.coverDays ?? DEFAULT_REPLENISHMENT_CONFIG.coverDays,
    enableAutoGenerate: config?.enableAutoGenerate ?? DEFAULT_REPLENISHMENT_CONFIG.enableAutoGenerate,
    minHistoryDays: config?.minHistoryDays ?? DEFAULT_REPLENISHMENT_CONFIG.minHistoryDays,
  };

  // 1. 查询所有库存项（含 minStock）
  const inventoryItems = db.prepare(`
    SELECT ii.sku, ii.warehouseId, ii.quantity, ii.minStock, ii.name AS skuName,
           w.name AS warehouseName
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouseId = w.id
  `).all() as Array<{
    sku: string;
    warehouseId: string;
    quantity: number;
    minStock: number;
    skuName: string | null;
    warehouseName: string | null;
  }>;

  if (inventoryItems.length === 0) {
    return { created: 0, suggestions: [] };
  }

  // 2. 查询每个 (sku, warehouseId) 的出库历史
  const dailyOutbounds = db.prepare(`
    SELECT
      it.sku,
      it.warehouseId,
      DATE(it.created_at) AS date,
      SUM(ABS(it.quantity)) AS dailyOutbound
    FROM inventory_transactions it
    WHERE it.type IN ('outbound', 'transfer_out')
    GROUP BY it.sku, it.warehouseId, DATE(it.created_at)
    ORDER BY it.sku, it.warehouseId, date ASC
  `).all() as Array<{
    sku: string;
    warehouseId: string;
    date: string;
    dailyOutbound: number;
  }>;

  // 按 (sku, warehouseId) 分组
  const outboundsBySkuWh = new Map<string, number[]>();
  for (const row of dailyOutbounds) {
    const key = `${row.sku}|${row.warehouseId}`;
    if (!outboundsBySkuWh.has(key)) {
      outboundsBySkuWh.set(key, []);
    }
    outboundsBySkuWh.get(key)!.push(row.dailyOutbound);
  }

  // 3. 获取在途数量
  const inTransitMap = getAllInTransit(db);

  // 4. 计算补货建议
  const suggestions: Array<{
    sku: string;
    warehouseId: string;
    currentStock: number;
    inTransitQty: number;
    safetyStock: number;
    dailyConsumption: number;
    targetStock: number;
    suggestedQty: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
    daysUntilZero: number;
  }> = [];

  for (const item of inventoryItems) {
    const key = `${item.sku}|${item.warehouseId}`;
    const dailyValues = outboundsBySkuWh.get(key) ?? [];

    // 数据不足时跳过（至少有 minHistoryDays 天数据才计算 EMA）
    if (dailyValues.length < cfg.minHistoryDays) {
      // 即使没有足够出库记录，仍检查是否低于安全库存
      const safetyStock = item.minStock || 0;
      const inTransitQty = inTransitMap.get(key) ?? 0;
      const currentStock = item.quantity;
      if (safetyStock > 0 && currentStock + inTransitQty < safetyStock) {
        const targetStock = safetyStock;
        const suggestedQty = Math.max(0, targetStock - currentStock - inTransitQty);
        if (suggestedQty > 0) {
          suggestions.push({
            sku: item.sku,
            warehouseId: item.warehouseId,
            currentStock,
            inTransitQty,
            safetyStock,
            dailyConsumption: 0,
            targetStock,
            suggestedQty,
            priority: 'high',
            daysUntilZero: Infinity,
          });
        }
      }
      continue;
    }

    const dailyConsumption = computeEMA(dailyValues, 0.3);
    if (dailyConsumption <= 0) continue;

    const currentStock = item.quantity;
    const inTransitQty = inTransitMap.get(key) ?? 0;
    const safetyStock = item.minStock || 0;

    const targetStock = Math.max(safetyStock, Math.ceil(dailyConsumption * cfg.coverDays));
    const daysUntilZero = dailyConsumption > 0
      ? (currentStock + inTransitQty) / dailyConsumption
      : Infinity;

    const suggestedQty = Math.max(0, targetStock - currentStock - inTransitQty);

    if (suggestedQty > 0) {
      const priority = calculatePriority(daysUntilZero, currentStock, inTransitQty, targetStock);
      suggestions.push({
        sku: item.sku,
        warehouseId: item.warehouseId,
        currentStock,
        inTransitQty,
        safetyStock,
        dailyConsumption: Math.round(dailyConsumption * 100) / 100,
        targetStock,
        suggestedQty,
        priority,
        daysUntilZero,
      });
    }
  }

  if (suggestions.length === 0) {
    return { created: 0, suggestions: [] };
  }

  // 5. 事务内：旧 pending 标记为 ignored，批量 INSERT 新建议
  const now = new Date().toISOString();

  const execute = db.transaction(() => {
    // 将旧的 pending 建议标记为 ignored
    db.prepare(
      `UPDATE replenishment_suggestions SET status = 'ignored', updated_at = ? WHERE status = 'pending'`
    ).run(now);

    // 批量插入新建议
    const insertStmt = db.prepare(`
      INSERT INTO replenishment_suggestions (
        sku, warehouse_id, current_stock, in_transit_qty, safety_stock,
        daily_consumption, target_stock, suggested_qty, source_warehouse_id,
        priority, status, transfer_order_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
    `);

    const createdSuggestions: ReplenishmentSuggestion[] = [];

    for (const s of suggestions) {
      const result = insertStmt.run(
        s.sku,
        s.warehouseId,
        s.currentStock,
        s.inTransitQty,
        s.safetyStock,
        s.dailyConsumption,
        s.targetStock,
        s.suggestedQty,
        null, // source_warehouse_id — 初始为 null，后续推荐
        s.priority,
        now,
        now,
      );

      createdSuggestions.push({
        id: Number(result.lastInsertRowid),
        sku: s.sku,
        warehouseId: s.warehouseId,
        currentStock: s.currentStock,
        inTransitQty: s.inTransitQty,
        safetyStock: s.safetyStock,
        dailyConsumption: s.dailyConsumption,
        targetStock: s.targetStock,
        suggestedQty: s.suggestedQty,
        priority: s.priority,
        status: 'pending',
        daysUntilZero: s.daysUntilZero === Infinity ? undefined : Math.round(s.daysUntilZero * 10) / 10,
        createdAt: now,
        updatedAt: now,
      });
    }

    return createdSuggestions;
  });

  const createdSuggestions = execute();
  return { created: createdSuggestions.length, suggestions: createdSuggestions };
}

/**
 * 查询补货建议列表（分页 + 筛选）
 */
export function getSuggestions(filters: {
  status?: string;
  priority?: string;
  warehouseId?: string;
  sku?: string;
  page?: number;
  pageSize?: number;
}): { items: ReplenishmentSuggestion[]; total: number; page: number; pageSize: number } {
  const db = initDb();
  const { status, priority, warehouseId, sku, page = 1, pageSize = 20 } = filters;

  let sql = `
    SELECT rs.*, w.name AS warehouseName, sw.name AS sourceWarehouseName, ii.name AS skuName
    FROM replenishment_suggestions rs
    LEFT JOIN warehouses w ON rs.warehouse_id = w.id
    LEFT JOIN warehouses sw ON rs.source_warehouse_id = sw.id
    LEFT JOIN inventory_items ii ON rs.sku = ii.sku AND rs.warehouse_id = ii.warehouseId
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (status) {
    sql += ' AND rs.status = ?';
    params.push(status);
  }
  if (priority) {
    sql += ' AND rs.priority = ?';
    params.push(priority);
  }
  if (warehouseId) {
    sql += ' AND rs.warehouse_id = ?';
    params.push(warehouseId);
  }
  if (sku) {
    sql += ' AND rs.sku LIKE ?';
    params.push(`%${sku}%`);
  }

  // Count query
  const countSql = sql.replace(
    /SELECT rs\.\*, w\.name AS warehouseName, sw\.name AS sourceWarehouseName, ii\.name AS skuName/,
    'SELECT COUNT(*) AS total'
  ).replace(/LEFT JOIN warehouses w.*?LEFT JOIN warehouses sw.*?LEFT JOIN inventory_items ii.*?WHERE/, 'WHERE');
  // Simpler count: just count the rows
  const countRow = db.prepare(
    `SELECT COUNT(*) AS total FROM replenishment_suggestions rs WHERE 1=1${
      status ? ' AND rs.status = ?' : ''
    }${priority ? ' AND rs.priority = ?' : ''}${
      warehouseId ? ' AND rs.warehouse_id = ?' : ''
    }${sku ? ' AND rs.sku LIKE ?' : ''}`
  ).get(...params) as { total: number };

  // 排序：优先级 critical > high > medium > low，然后 daysUntilZero 升序
  const priorityOrder = `CASE rs.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`;
  sql += ` ORDER BY ${priorityOrder} ASC, rs.created_at DESC`;

  const offset = (page - 1) * pageSize;
  sql += ' LIMIT ? OFFSET ?';
  params.push(pageSize, offset);

  const rows = db.prepare(sql).all(...params) as Array<ReplenishmentSuggestionRow & {
    warehouseName: string | null;
    sourceWarehouseName: string | null;
    skuName: string | null;
  }>;

  const items: ReplenishmentSuggestion[] = rows.map((row) => {
    const model = replenishmentRowToModel(row);
    model.warehouseName = row.warehouseName ?? undefined;
    model.sourceWarehouseName = row.sourceWarehouseName ?? undefined;
    model.skuName = row.skuName ?? undefined;

    // 计算 daysUntilZero
    if (model.dailyConsumption > 0) {
      model.daysUntilZero = Math.round(
        ((model.currentStock + model.inTransitQty) / model.dailyConsumption) * 10
      ) / 10;
    } else {
      model.daysUntilZero = undefined;
    }

    return model;
  });

  return { items, total: countRow.total, page, pageSize };
}

/**
 * 更新建议状态
 */
export function updateSuggestionStatus(
  id: number,
  status: 'pending' | 'confirmed' | 'ignored' | 'deferred',
): ReplenishmentSuggestion | null {
  const db = initDb();
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM replenishment_suggestions WHERE id = ?').get(id) as ReplenishmentSuggestionRow | undefined;
  if (!existing) return null;

  db.prepare(
    'UPDATE replenishment_suggestions SET status = ?, updated_at = ? WHERE id = ?'
  ).run(status, now, id);

  const updated = db.prepare('SELECT * FROM replenishment_suggestions WHERE id = ?').get(id) as ReplenishmentSuggestionRow;
  const model = replenishmentRowToModel(updated);

  // 填充仓库名和 SKU 名
  const whRow = db.prepare('SELECT name FROM warehouses WHERE id = ?').get(model.warehouseId) as { name: string } | undefined;
  model.warehouseName = whRow?.name ?? undefined;

  if (model.sourceWarehouseId) {
    const srcWhRow = db.prepare('SELECT name FROM warehouses WHERE id = ?').get(model.sourceWarehouseId) as { name: string } | undefined;
    model.sourceWarehouseName = srcWhRow?.name ?? undefined;
  }

  const skuRow = db.prepare('SELECT name FROM inventory_items WHERE sku = ? AND warehouseId = ?').get(model.sku, model.warehouseId) as { name: string } | undefined;
  model.skuName = skuRow?.name ?? undefined;

  if (model.dailyConsumption > 0) {
    model.daysUntilZero = Math.round(
      ((model.currentStock + model.inTransitQty) / model.dailyConsumption) * 10
    ) / 10;
  }

  return model;
}

/**
 * 从建议一键创建调拨单
 */
export function createTransferFromSuggestion(
  id: number,
  data: { fromWarehouseId: string; quantity: number },
): { suggestion: ReplenishmentSuggestion; transferOrderId: string } {
  const db = initDb();

  const execute = db.transaction(() => {
    const now = new Date().toISOString();

    // 1. 验证 suggestion 存在且 status === 'pending'
    const suggestion = db.prepare('SELECT * FROM replenishment_suggestions WHERE id = ?').get(id) as ReplenishmentSuggestionRow | undefined;
    if (!suggestion) throw new Error('补货建议不存在');
    if (suggestion.status !== 'pending') throw new Error('只有待处理状态的建议可以创建调拨单');

    // 2. 获取 SKU 名称
    const skuRow = db.prepare('SELECT name FROM inventory_items WHERE sku = ? AND warehouseId = ?').get(suggestion.sku, suggestion.warehouse_id) as { name: string } | undefined;
    const skuName = skuRow?.name ?? '';

    // 3. 调用 createTransferOrder 创建草稿调拨单
    const transferOrder = createTransferOrder({
      transferNo: generateTransferNo(),
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: suggestion.warehouse_id,
      sku: suggestion.sku,
      name: skuName,
      quantity: data.quantity,
      volume: 0,
      status: 'draft',
      transitOrderId: null,
      createdBy: 'replenishment-engine',
      submittedAt: null,
      submittedBy: null,
      receivedAt: null,
      receivedBy: null,
      completedAt: null,
      completedBy: null,
      remark: `由补货建议 #${id} 自动创建`,
    });

    // 4. 更新 suggestion 的 status='confirmed' + transferOrderId
    db.prepare(
      `UPDATE replenishment_suggestions SET status = 'confirmed', transfer_order_id = ?, source_warehouse_id = ?, updated_at = ? WHERE id = ?`
    ).run(transferOrder.id, data.fromWarehouseId, now, id);

    // 5. 读取更新后的建议
    const updatedSuggestion = db.prepare('SELECT * FROM replenishment_suggestions WHERE id = ?').get(id) as ReplenishmentSuggestionRow;
    const model = replenishmentRowToModel(updatedSuggestion);

    // 填充名称
    const whRow = db.prepare('SELECT name FROM warehouses WHERE id = ?').get(model.warehouseId) as { name: string } | undefined;
    model.warehouseName = whRow?.name ?? undefined;

    if (model.sourceWarehouseId) {
      const srcWhRow = db.prepare('SELECT name FROM warehouses WHERE id = ?').get(model.sourceWarehouseId) as { name: string } | undefined;
      model.sourceWarehouseName = srcWhRow?.name ?? undefined;
    }

    const updatedSkuRow = db.prepare('SELECT name FROM inventory_items WHERE sku = ? AND warehouseId = ?').get(model.sku, model.warehouseId) as { name: string } | undefined;
    model.skuName = updatedSkuRow?.name ?? undefined;

    if (model.dailyConsumption > 0) {
      model.daysUntilZero = Math.round(
        ((model.currentStock + model.inTransitQty) / model.dailyConsumption) * 10
      ) / 10;
    }

    return { suggestion: model, transferOrderId: transferOrder.id };
  });

  return execute();
}

/**
 * 来源仓库推荐
 *
 * 查询其他仓库该 SKU 的库存，计算 surplus 和 score，按 score 降序返回。
 */
export function recommendSourceWarehouse(
  sku: string,
  excludeWarehouseId: string,
  suggestedQty: number,
): SourceRecommendation[] {
  const db = initDb();

  const rows = db.prepare(`
    SELECT ii.warehouseId, ii.quantity, ii.minStock, w.name AS warehouseName
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouseId = w.id
    WHERE ii.sku = ? AND ii.warehouseId != ?
  `).all(sku, excludeWarehouseId) as Array<{
    warehouseId: string;
    quantity: number;
    minStock: number;
    warehouseName: string | null;
  }>;

  const recommendations: SourceRecommendation[] = [];

  for (const row of rows) {
    const surplus = row.quantity - row.minStock;
    if (surplus <= 0) continue; // 没有富余库存的仓库不推荐

    const score = surplus / Math.max(1, suggestedQty);
    recommendations.push({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName ?? row.warehouseId,
      surplus,
      score: Math.round(score * 100) / 100,
    });
  }

  // 按 score 降序排序
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations;
}

/**
 * 获取补货统计信息
 */
export function getReplenishmentStats(): {
  total: number;
  pending: number;
  critical: number;
  totalInTransitQty: number;
  todayConfirmed: number;
} {
  const db = initDb();

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM replenishment_suggestions').get() as { cnt: number };
  const pending = db.prepare("SELECT COUNT(*) AS cnt FROM replenishment_suggestions WHERE status = 'pending'").get() as { cnt: number };
  const critical = db.prepare("SELECT COUNT(*) AS cnt FROM replenishment_suggestions WHERE priority = 'critical' AND status = 'pending'").get() as { cnt: number };
  const inTransit = db.prepare("SELECT COALESCE(SUM(in_transit_qty), 0) AS total FROM replenishment_suggestions WHERE status = 'pending'").get() as { total: number };
  const todayConfirmed = db.prepare(
    "SELECT COUNT(*) AS cnt FROM replenishment_suggestions WHERE status = 'confirmed' AND DATE(updated_at) = DATE('now')"
  ).get() as { cnt: number };

  return {
    total: total.cnt,
    pending: pending.cnt,
    critical: critical.cnt,
    totalInTransitQty: inTransit.total,
    todayConfirmed: todayConfirmed.cnt,
  };
}
