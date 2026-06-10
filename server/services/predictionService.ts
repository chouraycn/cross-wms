/**
 * Prediction Service
 *
 * 智能库存预测引擎，基于 EMA（指数平滑法）预测未来库存趋势。
 * 支持预测短缺和预测积压两种预警类型。
 *
 * 设计原则：
 * - 零新增依赖（EMA 纯 JS 实现 ~15 行）
 * - 去重逻辑严格对齐 alertService.ts
 * - 函数签名对齐 alertService：checkAllPredictions(db, config) → AlertCheckResult
 */

import Database from 'better-sqlite3';
import type {
  AlertCheckResult,
  PredictionConfig,
  DailyOutbound,
  SkuPrediction,
  PredictionDetail,
  WmsAlert,
} from '../models/wms-skill.js';
import { DEFAULT_PREDICTION_CONFIG } from '../models/wms-skill.js';

// ===================== EMA 指数平滑算法 =====================

/**
 * 计算指数加权移动平均 (Exponential Moving Average)
 *
 * @param values - 按时间顺序排列的每日出库量数组（oldest first）
 * @param alpha - 平滑系数，默认 0.3（权重偏向近期数据）
 * @returns EMA 值（日均消耗速率）
 */
export function computeEMA(values: number[], alpha: number = 0.3): number {
  if (values.length === 0) return 0;
  let ema = values[0]; // 初始值为第一个数据点
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

// ===================== 核心函数 =====================

/**
 * 执行完整预测扫描
 *
 * @param db - 数据库实例
 * @param config - 预测配置（可选，使用默认值）
 * @returns 扫描结果（含新预测预警计数）
 */
export async function checkAllPredictions(
  db: Database.Database,
  config?: PredictionConfig
): Promise<AlertCheckResult> {
  const cfg: PredictionConfig = {
    enabled: config?.enabled ?? DEFAULT_PREDICTION_CONFIG.enabled,
    predictionDays: config?.predictionDays ?? DEFAULT_PREDICTION_CONFIG.predictionDays,
    shortageThreshold: config?.shortageThreshold ?? DEFAULT_PREDICTION_CONFIG.shortageThreshold,
    overstockDays: config?.overstockDays ?? DEFAULT_PREDICTION_CONFIG.overstockDays,
    minHistoryDays: config?.minHistoryDays ?? DEFAULT_PREDICTION_CONFIG.minHistoryDays,
  };

  const result: AlertCheckResult = {
    newAlerts: 0,
    lowStockAlerts: 0,
    expiryAlerts: 0,
    stagnantAlerts: 0,
    predictedShortageAlerts: 0,
    predictedOverstockAlerts: 0,
    errors: [],
  };

  if (!cfg.enabled) {
    return result;
  }

  try {
    // 1. 查询每日出库聚合数据（过去 30 天）
    const dailyOutbounds = db.prepare(`
      SELECT
        it.sku,
        it.warehouse_id AS warehouseId,
        DATE(it.created_at) AS date,
        SUM(ABS(it.quantity)) AS dailyOutbound
      FROM inventory_transactions it
      WHERE it.type IN ('outbound', 'transfer_out')
        AND it.created_at >= DATE('now', '-30 days')
      GROUP BY it.sku, it.warehouse_id, DATE(it.created_at)
      ORDER BY it.sku, it.warehouse_id, date ASC
    `).all() as DailyOutbound[];

    if (dailyOutbounds.length === 0) {
      return result;
    }

    // 2. 查询所有 SKU 的当前库存和仓库信息
    const inventoryItems = db.prepare(`
      SELECT
        ii.sku,
        ii.warehouseId AS warehouse_id,
        ii.quantity AS current_stock,
        w.name AS warehouse_name
      FROM inventory_items ii
      LEFT JOIN warehouses w ON ii.warehouseId = w.id
      WHERE ii.quantity > 0
    `).all() as Array<{
      sku: string;
      warehouse_id: string;
      current_stock: number;
      warehouse_name: string | null;
    }>;

    // 构建库存索引：`sku|warehouseId` → 库存信息
    const stockIndex = new Map<string, { currentStock: number; warehouseName: string }>();
    for (const item of inventoryItems) {
      const key = `${item.sku}|${item.warehouse_id}`;
      stockIndex.set(key, {
        currentStock: item.current_stock,
        warehouseName: item.warehouse_name ?? item.warehouse_id,
      });
    }

    // 3. 按 (sku, warehouseId) 分组出库数据
    const groupingKey = (d: DailyOutbound) => `${d.sku}|${d.warehouseId}`;
    const groups = new Map<string, DailyOutbound[]>();

    for (const d of dailyOutbounds) {
      const key = groupingKey(d);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(d);
    }

    // 4. 对每组进行 EMA 预测和预警判定
    const insertStmt = db.prepare(`
      INSERT INTO wms_alerts (
        warehouse_id,
        alert_type,
        severity,
        sku,
        message,
        triggered_at,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'active', datetime('now'), datetime('now'))
    `);

    const predictAll = db.transaction(() => {
      for (const [key, outbounds] of groups) {
        const [sku, warehouseId] = key.split('|');
        const stock = stockIndex.get(key);
        if (!stock || stock.currentStock <= 0) continue;

        // 计算历史出库天数和 EMA
        const historyDays = outbounds.length;
        if (historyDays < cfg.minHistoryDays) continue; // 数据不足，跳过

        const dailyValues = outbounds.map((d) => d.dailyOutbound);
        const dailyConsumption = computeEMA(dailyValues, 0.3);

        if (dailyConsumption <= 0) continue; // 无效消耗速率，跳过

        // 预测库存 = 当前库存 - 日均消耗 × 预测天数
        const predictedStock = stock.currentStock - dailyConsumption * cfg.predictionDays;
        const daysUntilZero = dailyConsumption > 0
          ? Math.round(stock.currentStock / dailyConsumption)
          : Number.MAX_SAFE_INTEGER;

        // 置信度判定
        let confidence: 'high' | 'medium' | 'low' = 'low';
        if (historyDays >= 28) {
          confidence = 'high';
        } else if (historyDays >= 14) {
          confidence = 'medium';
        }

        // === 预测短缺判定 ===
        if (predictedStock <= cfg.shortageThreshold || daysUntilZero <= cfg.predictionDays) {
          // 去重：检查是否已有活跃的 predicted_shortage 预警
          const existing = db.prepare(`
            SELECT COUNT(*) AS cnt FROM wms_alerts
            WHERE alert_type = 'predicted_shortage'
              AND status = 'active'
              AND sku = ?
              AND warehouse_id = ?
          `).get(sku, warehouseId) as { cnt: number };

          if (existing.cnt === 0) {
            // 严重程度判定
            let severity: WmsAlert['severity'] = 'medium';
            if (daysUntilZero <= 3) {
              severity = 'critical';
            } else if (daysUntilZero <= 7) {
              severity = 'high';
            } else if (daysUntilZero <= 14) {
              severity = 'medium';
            } else {
              severity = 'low';
            }

            const warehouseName = stock.warehouseName;
            insertStmt.run(
              warehouseId,
              'predicted_shortage',
              severity,
              sku,
              `[预测短缺] SKU ${sku} 预计 ${daysUntilZero} 天后缺货（当前库存 ${stock.currentStock}，日耗 ${dailyConsumption.toFixed(1)}，置信度: ${confidence}，仓库: ${warehouseName}）`
            );
            result.predictedShortageAlerts++;
            result.newAlerts++;
          }
        }

        // === 预测积压判定 ===
        if (daysUntilZero > cfg.overstockDays) {
          // 去重：检查是否已有活跃的 predicted_overstock 预警
          const existing = db.prepare(`
            SELECT COUNT(*) AS cnt FROM wms_alerts
            WHERE alert_type = 'predicted_overstock'
              AND status = 'active'
              AND sku = ?
              AND warehouse_id = ?
          `).get(sku, warehouseId) as { cnt: number };

          if (existing.cnt === 0) {
            // 严重程度判定（超过 overstockDays 越多越严重）
            let severity: WmsAlert['severity'] = 'medium';
            const excessRatio = daysUntilZero / cfg.overstockDays;
            if (excessRatio >= 3) {
              severity = 'critical';
            } else if (excessRatio >= 2) {
              severity = 'high';
            } else if (excessRatio >= 1.5) {
              severity = 'medium';
            } else {
              severity = 'low';
            }

            const warehouseName = stock.warehouseName;
            insertStmt.run(
              warehouseId,
              'predicted_overstock',
              severity,
              sku,
              `[预测积压] SKU ${sku} 按当前消耗速率可使用 ${daysUntilZero} 天（超出阈值 ${cfg.overstockDays} 天，置信度: ${confidence}，仓库: ${warehouseName}）`
            );
            result.predictedOverstockAlerts++;
            result.newAlerts++;
          }
        }
      }
    });

    predictAll();
  } catch (err) {
    result.errors.push(`预测扫描失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * 获取单个 SKU 的预测详情（用于前端图表渲染）
 *
 * @param db - 数据库实例
 * @param sku - SKU 编号
 * @param warehouseId - 仓库 ID
 * @param config - 预测配置（可选）
 * @returns 预测详情，若无数据返回 null
 */
export function getPredictionDetail(
  db: Database.Database,
  sku: string,
  warehouseId: string,
  config?: PredictionConfig
): PredictionDetail | null {
  const cfg: PredictionConfig = {
    enabled: config?.enabled ?? DEFAULT_PREDICTION_CONFIG.enabled,
    predictionDays: config?.predictionDays ?? DEFAULT_PREDICTION_CONFIG.predictionDays,
    shortageThreshold: config?.shortageThreshold ?? DEFAULT_PREDICTION_CONFIG.shortageThreshold,
    overstockDays: config?.overstockDays ?? DEFAULT_PREDICTION_CONFIG.overstockDays,
    minHistoryDays: config?.minHistoryDays ?? DEFAULT_PREDICTION_CONFIG.minHistoryDays,
  };

  // 查询当前库存和仓库名
  const stockRow = db.prepare(`
    SELECT
      ii.quantity AS current_stock,
      w.name AS warehouse_name
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouseId = w.id
    WHERE ii.sku = ? AND ii.warehouseId = ?
  `).get(sku, warehouseId) as { current_stock: number; warehouse_name: string | null } | undefined;

  if (!stockRow || stockRow.current_stock <= 0) {
    return null;
  }

  // 查询过去 30 天的每日出库和库存快照
  const historyOutbounds = db.prepare(`
    SELECT
      DATE(it.created_at) AS date,
      SUM(ABS(it.quantity)) AS outbound
    FROM inventory_transactions it
    WHERE it.sku = ?
      AND it.warehouse_id = ?
      AND it.type IN ('outbound', 'transfer_out')
      AND it.created_at >= DATE('now', '-30 days')
    GROUP BY DATE(it.created_at)
    ORDER BY date ASC
  `).all(sku, warehouseId) as Array<{ date: string; outbound: number }>;

  // 查询过去 30 天的库存快照（用于历史库存线）
  const historySnapshots = db.prepare(`
    SELECT
      DATE(created_at) AS date,
      quantity AS stock
    FROM inventory_items
    WHERE sku = ? AND warehouseId = ?
      AND created_at >= DATE('now', '-30 days')
    ORDER BY date ASC
  `).all(sku, warehouseId) as Array<{ date: string; stock: number }>;

  // 合并历史出库到日期索引
  const outboundByDate = new Map<string, number>();
  for (const row of historyOutbounds) {
    outboundByDate.set(row.date, row.outbound);
  }

  // 合并历史库存到日期索引
  const stockByDate = new Map<string, number>();
  for (const row of historySnapshots) {
    stockByDate.set(row.date, row.stock);
  }

  // 构建全量日期列表（过去 30 天所有有数据的日期）
  const allDates = new Set<string>();
  historyOutbounds.forEach((r) => allDates.add(r.date));
  historySnapshots.forEach((r) => allDates.add(r.date));
  const sortedDates = Array.from(allDates).sort();

  // 构建历史数据数组
  const historyData: Array<{ date: string; stock: number; outbound: number }> = sortedDates.map((date) => ({
    date,
    stock: stockByDate.get(date) ?? stockRow.current_stock,
    outbound: outboundByDate.get(date) ?? 0,
  }));

  // 计算 EMA 日均消耗
  const dailyValues = historyOutbounds.map((r) => r.outbound);
  const dailyConsumption = computeEMA(dailyValues, 0.3);
  const daysUntilZero = dailyConsumption > 0
    ? Math.round(stockRow.current_stock / dailyConsumption)
    : Number.MAX_SAFE_INTEGER;

  // 置信度
  const historyDays = historyOutbounds.length;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (historyDays >= 28) {
    confidence = 'high';
  } else if (historyDays >= 14) {
    confidence = 'medium';
  }

  // 构建预测曲线（未来 N 天）
  const predictionCurve: Array<{ date: string; predictedStock: number }> = [];
  const today = new Date();
  for (let i = 1; i <= cfg.predictionDays; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + i);
    const dateStr = futureDate.toISOString().split('T')[0];
    const predictedStock = Math.max(0, stockRow.current_stock - dailyConsumption * i);
    predictionCurve.push({
      date: dateStr,
      predictedStock: Math.round(predictedStock * 100) / 100,
    });
  }

  return {
    sku,
    warehouseId,
    warehouseName: stockRow.warehouse_name ?? undefined,
    currentStock: stockRow.current_stock,
    dailyConsumption: Math.round(dailyConsumption * 100) / 100,
    daysUntilZero,
    confidence,
    historyData,
    predictionCurve,
    safetyStockLine: cfg.shortageThreshold,
  };
}
