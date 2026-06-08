/**
 * WMS Skill Data Access Object
 *
 * 提供 WMS 行业技能相关的数据库 CRUD 操作：
 * - 入库质检（wms_quality_checks）
 * - 库存盘点（wms_inventory_counts）
 * - 出库复核（wms_outbound_reviews）
 * - 异常预警（wms_alerts）
 * - 报表生成（wms_reports）
 *
 * 所有方法使用 better-sqlite3 同步 API，通过 initDb() 获取数据库连接。
 */
import Database from 'better-sqlite3';
import { initDb } from '../db.js';
import type {
  QualityCheck,
  QualityCheckRow,
  InventoryCount,
  InventoryCountRow,
  OutboundReview,
  OutboundReviewRow,
  WmsAlert,
  WmsAlertRow,
  WmsReport,
  WmsReportRow,
} from '../models/wms-skill.js';
import {
  qualityCheckRowToModel,
  inventoryCountRowToModel,
  outboundReviewRowToModel,
  alertRowToModel,
  reportRowToModel,
} from '../models/wms-skill.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ===================== 初始化 WMS 表 =====================

/**
 * 确保 WMS 技能相关的表已创建（幂等，在 initDb() 中调用）。
 * 使用 CREATE TABLE IF NOT EXISTS 保证安全性。
 */
export function ensureWmsTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wms_quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      product_name TEXT,
      batch_no TEXT,
      expiry_date TEXT,
      expected_quantity INTEGER DEFAULT 0,
      actual_quantity INTEGER DEFAULT 0,
      quality_status TEXT DEFAULT 'pending',
      inspector TEXT,
      check_time TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wms_inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id TEXT NOT NULL,
      location_code TEXT NOT NULL,
      sku TEXT NOT NULL,
      system_quantity INTEGER DEFAULT 0,
      actual_quantity INTEGER DEFAULT 0,
      variance INTEGER GENERATED ALWAYS AS (actual_quantity - system_quantity) STORED,
      counter TEXT,
      count_time TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wms_outbound_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbound_order_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      product_name TEXT,
      expected_quantity INTEGER DEFAULT 0,
      scanned_quantity INTEGER DEFAULT 0,
      review_status TEXT DEFAULT 'pending',
      reviewer TEXT,
      review_time TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wms_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      sku TEXT,
      message TEXT NOT NULL,
      triggered_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wms_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type TEXT NOT NULL,
      warehouse_id TEXT,
      start_date TEXT,
      end_date TEXT,
      file_path TEXT,
      file_format TEXT DEFAULT 'csv',
      generated_by TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_wms_quality_warehouse ON wms_quality_checks(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_wms_quality_status ON wms_quality_checks(quality_status);
    CREATE INDEX IF NOT EXISTS idx_wms_quality_sku ON wms_quality_checks(sku);
    CREATE INDEX IF NOT EXISTS idx_wms_inventory_count_warehouse ON wms_inventory_counts(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_wms_inventory_count_status ON wms_inventory_counts(status);
    CREATE INDEX IF NOT EXISTS idx_wms_inventory_count_sku ON wms_inventory_counts(sku);
    CREATE INDEX IF NOT EXISTS idx_wms_outbound_review_warehouse ON wms_outbound_reviews(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_wms_outbound_review_order ON wms_outbound_reviews(outbound_order_id);
    CREATE INDEX IF NOT EXISTS idx_wms_alerts_warehouse ON wms_alerts(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_wms_alerts_type ON wms_alerts(alert_type);
    CREATE INDEX IF NOT EXISTS idx_wms_alerts_status ON wms_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_wms_reports_type ON wms_reports(report_type);
    CREATE INDEX IF NOT EXISTS idx_wms_reports_warehouse ON wms_reports(warehouse_id);
  `);
}

// ===================== 质检（Quality Check）DAO =====================

/** 创建质检记录，返回自增 ID */
export function createQualityCheck(check: Omit<QualityCheck, 'id' | 'createdAt' | 'updatedAt'>): number {
  const db = initDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO wms_quality_checks
      (warehouse_id, sku, product_name, batch_no, expiry_date, expected_quantity, actual_quantity,
       quality_status, inspector, check_time, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const info = stmt.run(
    check.warehouseId,
    check.sku,
    check.productName ?? null,
    check.batchNo ?? null,
    check.expiryDate ?? null,
    check.expectedQuantity,
    check.actualQuantity,
    check.qualityStatus,
    check.inspector ?? null,
    check.checkTime ?? null,
    check.notes ?? null,
    now,
    now
  );
  return Number(info.lastInsertRowid);
}

/** 查询质检记录，支持 warehouseId / qualityStatus / sku 过滤 */
export function getQualityChecks(filters?: {
  warehouseId?: string;
  qualityStatus?: string;
  sku?: string;
}): QualityCheck[] {
  const db = initDb();
  let sql = 'SELECT * FROM wms_quality_checks WHERE 1=1';
  const params: unknown[] = [];
  if (filters?.warehouseId) {
    sql += ' AND warehouse_id = ?';
    params.push(filters.warehouseId);
  }
  if (filters?.qualityStatus) {
    sql += ' AND quality_status = ?';
    params.push(filters.qualityStatus);
  }
  if (filters?.sku) {
    sql += ' AND sku LIKE ?';
    params.push(`%${filters.sku}%`);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as QualityCheckRow[];
  return rows.map(qualityCheckRowToModel);
}

/** 根据 ID 查询单条质检记录 */
export function getQualityCheckById(id: number): QualityCheck | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM wms_quality_checks WHERE id = ?').get(id) as QualityCheckRow | undefined;
  return row ? qualityCheckRowToModel(row) : undefined;
}

/** 更新质检记录 */
export function updateQualityCheck(id: number, updates: Partial<QualityCheck>): boolean {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM wms_quality_checks WHERE id = ?').get(id) as QualityCheckRow | undefined;
  if (!existing) return false;
  const now = new Date().toISOString();
  const merged = { ...qualityCheckRowToModel(existing), ...updates, updatedAt: now };
  db.prepare(
    `UPDATE wms_quality_checks SET
      warehouse_id=?, sku=?, product_name=?, batch_no=?, expiry_date=?,
      expected_quantity=?, actual_quantity=?, quality_status=?,
      inspector=?, check_time=?, notes=?, updated_at=?
     WHERE id=?`
  ).run(
    merged.warehouseId, merged.sku, merged.productName ?? null, merged.batchNo ?? null, merged.expiryDate ?? null,
    merged.expectedQuantity, merged.actualQuantity, merged.qualityStatus,
    merged.inspector ?? null, merged.checkTime ?? null, merged.notes ?? null, now, id
  );
  return true;
}

/** 删除质检记录 */
export function deleteQualityCheck(id: number): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM wms_quality_checks WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== 盘点（Inventory Count）DAO =====================

/** 创建盘点记录，返回自增 ID */
export function createInventoryCount(count: Omit<InventoryCount, 'id' | 'variance' | 'createdAt' | 'updatedAt'>): number {
  const db = initDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO wms_inventory_counts
      (warehouse_id, location_code, sku, system_quantity, actual_quantity,
       counter, count_time, status, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const info = stmt.run(
    count.warehouseId,
    count.locationCode,
    count.sku,
    count.systemQuantity,
    count.actualQuantity,
    count.counter ?? null,
    count.countTime ?? null,
    count.status,
    count.notes ?? null,
    now,
    now
  );
  return Number(info.lastInsertRowid);
}

/** 查询盘点记录，支持 warehouseId / status / sku / locationCode 过滤 */
export function getInventoryCounts(filters?: {
  warehouseId?: string;
  status?: string;
  sku?: string;
  locationCode?: string;
}): InventoryCount[] {
  const db = initDb();
  let sql = 'SELECT * FROM wms_inventory_counts WHERE 1=1';
  const params: unknown[] = [];
  if (filters?.warehouseId) {
    sql += ' AND warehouse_id = ?';
    params.push(filters.warehouseId);
  }
  if (filters?.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.sku) {
    sql += ' AND sku LIKE ?';
    params.push(`%${filters.sku}%`);
  }
  if (filters?.locationCode) {
    sql += ' AND location_code LIKE ?';
    params.push(`%${filters.locationCode}%`);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as InventoryCountRow[];
  return rows.map(inventoryCountRowToModel);
}

/** 根据 ID 查询单条盘点记录 */
export function getInventoryCountById(id: number): InventoryCount | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM wms_inventory_counts WHERE id = ?').get(id) as InventoryCountRow | undefined;
  return row ? inventoryCountRowToModel(row) : undefined;
}

/** 更新盘点记录 */
export function updateInventoryCount(id: number, updates: Partial<InventoryCount>): boolean {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM wms_inventory_counts WHERE id = ?').get(id) as InventoryCountRow | undefined;
  if (!existing) return false;
  const now = new Date().toISOString();
  const merged = { ...inventoryCountRowToModel(existing), ...updates, updatedAt: now };
  db.prepare(
    `UPDATE wms_inventory_counts SET
      warehouse_id=?, location_code=?, sku=?, system_quantity=?, actual_quantity=?,
      counter=?, count_time=?, status=?, notes=?, updated_at=?
     WHERE id=?`
  ).run(
    merged.warehouseId, merged.locationCode, merged.sku, merged.systemQuantity, merged.actualQuantity,
    merged.counter ?? null, merged.countTime ?? null, merged.status, merged.notes ?? null, now, id
  );
  return true;
}

/**
 * 盘点差异调整 — 在事务中同时更新盘点记录状态为 adjusted，
 * 并更新 inventory_items 表中对应 SKU 的数量为实际盘点的数量。
 *
 * @returns 调整后的盘点记录，若失败返回 undefined
 */
export function adjustInventoryCount(id: number, adjustedBy?: string): InventoryCount | undefined {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM wms_inventory_counts WHERE id = ?').get(id) as InventoryCountRow | undefined;
  if (!existing) return undefined;

  const model = inventoryCountRowToModel(existing);
  if (model.status === 'adjusted') {
    return model; // 已调整，直接返回
  }

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    // 更新盘点状态为 adjusted
    db.prepare(
      `UPDATE wms_inventory_counts SET status = 'adjusted', notes = ?, updated_at = ? WHERE id = ?`
    ).run(
      `${model.notes ? model.notes + '; ' : ''}adjusted by ${adjustedBy ?? 'system'}`,
      now,
      id
    );

    // 同步更新 inventory_items 中的库存数量
    db.prepare(
      `UPDATE inventory_items SET quantity = ? WHERE sku = ? AND warehouseId = ?`
    ).run(model.actualQuantity, model.sku, model.warehouseId);

    // 记录库存事务
    const variance = model.actualQuantity - model.systemQuantity;
    if (variance !== 0) {
      db.prepare(
        `INSERT INTO inventory_transactions (sku, type, quantity, warehouseId, operator, sourceId, sourceType, remark)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        model.sku,
        'adjustment',
        Math.abs(variance),
        model.warehouseId,
        adjustedBy ?? 'system',
        String(id),
        'inventory_count',
        `盘差调整: ${variance > 0 ? '+' : ''}${variance}`
      );
    }
  });

  transaction();
  return getInventoryCountById(id);
}

// ===================== 出库复核（Outbound Review）DAO =====================

/** 创建出库复核记录，返回自增 ID */
export function createOutboundReview(review: Omit<OutboundReview, 'id' | 'createdAt' | 'updatedAt'>): number {
  const db = initDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO wms_outbound_reviews
      (outbound_order_id, warehouse_id, sku, product_name, expected_quantity, scanned_quantity,
       review_status, reviewer, review_time, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const info = stmt.run(
    review.outboundOrderId,
    review.warehouseId,
    review.sku,
    review.productName ?? null,
    review.expectedQuantity,
    review.scannedQuantity,
    review.reviewStatus,
    review.reviewer ?? null,
    review.reviewTime ?? null,
    review.notes ?? null,
    now,
    now
  );
  return Number(info.lastInsertRowid);
}

/** 查询出库复核记录，支持 warehouseId / reviewStatus / outboundOrderId / sku 过滤 */
export function getOutboundReviews(filters?: {
  warehouseId?: string;
  reviewStatus?: string;
  outboundOrderId?: string;
  sku?: string;
}): OutboundReview[] {
  const db = initDb();
  let sql = 'SELECT * FROM wms_outbound_reviews WHERE 1=1';
  const params: unknown[] = [];
  if (filters?.warehouseId) {
    sql += ' AND warehouse_id = ?';
    params.push(filters.warehouseId);
  }
  if (filters?.reviewStatus) {
    sql += ' AND review_status = ?';
    params.push(filters.reviewStatus);
  }
  if (filters?.outboundOrderId) {
    sql += ' AND outbound_order_id = ?';
    params.push(filters.outboundOrderId);
  }
  if (filters?.sku) {
    sql += ' AND sku LIKE ?';
    params.push(`%${filters.sku}%`);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as OutboundReviewRow[];
  return rows.map(outboundReviewRowToModel);
}

/** 根据 ID 查询单条出库复核记录 */
export function getOutboundReviewById(id: number): OutboundReview | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM wms_outbound_reviews WHERE id = ?').get(id) as OutboundReviewRow | undefined;
  return row ? outboundReviewRowToModel(row) : undefined;
}

/** 更新出库复核记录 */
export function updateOutboundReview(id: number, updates: Partial<OutboundReview>): boolean {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM wms_outbound_reviews WHERE id = ?').get(id) as OutboundReviewRow | undefined;
  if (!existing) return false;
  const now = new Date().toISOString();
  const merged = { ...outboundReviewRowToModel(existing), ...updates, updatedAt: now };
  db.prepare(
    `UPDATE wms_outbound_reviews SET
      outbound_order_id=?, warehouse_id=?, sku=?, product_name=?,
      expected_quantity=?, scanned_quantity=?, review_status=?,
      reviewer=?, review_time=?, notes=?, updated_at=?
     WHERE id=?`
  ).run(
    merged.outboundOrderId, merged.warehouseId, merged.sku, merged.productName ?? null,
    merged.expectedQuantity, merged.scannedQuantity, merged.reviewStatus,
    merged.reviewer ?? null, merged.reviewTime ?? null, merged.notes ?? null, now, id
  );
  return true;
}

// ===================== 异常预警（Alert）DAO =====================

/** 创建预警记录，返回自增 ID */
export function createAlert(alert: Omit<WmsAlert, 'id' | 'triggeredAt' | 'createdAt' | 'updatedAt'>): number {
  const db = initDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO wms_alerts
      (warehouse_id, alert_type, severity, sku, message, triggered_at, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const info = stmt.run(
    alert.warehouseId,
    alert.alertType,
    alert.severity,
    alert.sku ?? null,
    alert.message,
    alert.triggeredAt ?? now,
    alert.status,
    now,
    now
  );
  return Number(info.lastInsertRowid);
}

/** 查询预警记录，支持 warehouseId / alertType / severity / status 过滤 */
export function getAlerts(filters?: {
  warehouseId?: string;
  alertType?: string;
  severity?: string;
  status?: string;
}): WmsAlert[] {
  const db = initDb();
  let sql = 'SELECT * FROM wms_alerts WHERE 1=1';
  const params: unknown[] = [];
  if (filters?.warehouseId) {
    sql += ' AND warehouse_id = ?';
    params.push(filters.warehouseId);
  }
  if (filters?.alertType) {
    sql += ' AND alert_type = ?';
    params.push(filters.alertType);
  }
  if (filters?.severity) {
    sql += ' AND severity = ?';
    params.push(filters.severity);
  }
  if (filters?.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  sql += ' ORDER BY triggered_at DESC';
  const rows = db.prepare(sql).all(...params) as WmsAlertRow[];
  return rows.map(alertRowToModel);
}

/** 根据 ID 查询单条预警记录 */
export function getAlertById(id: number): WmsAlert | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM wms_alerts WHERE id = ?').get(id) as WmsAlertRow | undefined;
  return row ? alertRowToModel(row) : undefined;
}

/** 解决预警（标记为 resolved 或 ignored） */
export function resolveAlert(id: number, resolution: 'resolved' | 'ignored'): boolean {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM wms_alerts WHERE id = ?').get(id) as WmsAlertRow | undefined;
  if (!existing) return false;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE wms_alerts SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?`
  ).run(resolution, now, now, id);
  return true;
}

/**
 * 执行预警检查 — 扫描 inventory_items 表中库存低于阈值的 SKU，
 * 以及临期/滞留商品，生成预警记录。
 *
 * @returns 新生成的预警数量
 */
export function checkAlerts(warehouseId?: string, lowStockThreshold: number = 10): number {
  const db = initDb();
  let count = 0;
  const now = new Date().toISOString();

  // 1. 低库存预警
  let lowStockSql = `SELECT sku, warehouseId, quantity FROM inventory_items WHERE quantity < ?`;
  const lowStockParams: unknown[] = [lowStockThreshold];
  if (warehouseId) {
    lowStockSql += ' AND warehouseId = ?';
    lowStockParams.push(warehouseId);
  }
  const lowStockItems = db.prepare(lowStockSql).all(...lowStockParams) as Array<{ sku: string; warehouseId: string; quantity: number }>;
  for (const item of lowStockItems) {
    createAlert({
      warehouseId: item.warehouseId,
      alertType: 'low_stock',
      severity: item.quantity === 0 ? 'critical' : item.quantity < 5 ? 'high' : 'medium',
      sku: item.sku,
      message: `库存不足: SKU ${item.sku} 当前库存 ${item.quantity}，低于阈值 ${lowStockThreshold}`,
      status: 'active',
    });
    count++;
  }

  // 2. 临期预警 — 检查入库质检中 30 天内过期的记录
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  let expirySql = `SELECT sku, warehouse_id, expiry_date FROM wms_quality_checks WHERE expiry_date IS NOT NULL AND expiry_date <= ? AND quality_status != 'unqualified'`;
  const expiryParams: unknown[] = [thirtyDaysLater];
  if (warehouseId) {
    expirySql += ' AND warehouse_id = ?';
    expiryParams.push(warehouseId);
  }
  const expiryItems = db.prepare(expirySql).all(...expiryParams) as Array<{ sku: string; warehouse_id: string; expiry_date: string }>;
  for (const item of expiryItems) {
    createAlert({
      warehouseId: item.warehouse_id,
      alertType: 'expiry',
      severity: 'high',
      sku: item.sku,
      message: `临期预警: SKU ${item.sku} 将于 ${item.expiry_date} 过期`,
      status: 'active',
    });
    count++;
  }

  return count;
}

// ===================== 报表（Report）DAO =====================

/** 创建报表记录，返回自增 ID */
export function createReport(report: Omit<WmsReport, 'id' | 'createdAt' | 'updatedAt'>): number {
  const db = initDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO wms_reports
      (report_type, warehouse_id, start_date, end_date, file_path, file_format,
       generated_by, generated_at, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const info = stmt.run(
    report.reportType,
    report.warehouseId ?? null,
    report.startDate ?? null,
    report.endDate ?? null,
    report.filePath ?? null,
    report.fileFormat,
    report.generatedBy ?? null,
    report.generatedAt ?? now,
    report.status,
    now,
    now
  );
  return Number(info.lastInsertRowid);
}

/** 查询报表记录，支持 reportType / warehouseId / status 过滤 */
export function getReports(filters?: {
  reportType?: string;
  warehouseId?: string;
  status?: string;
}): WmsReport[] {
  const db = initDb();
  let sql = 'SELECT * FROM wms_reports WHERE 1=1';
  const params: unknown[] = [];
  if (filters?.reportType) {
    sql += ' AND report_type = ?';
    params.push(filters.reportType);
  }
  if (filters?.warehouseId) {
    sql += ' AND warehouse_id = ?';
    params.push(filters.warehouseId);
  }
  if (filters?.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  sql += ' ORDER BY generated_at DESC';
  const rows = db.prepare(sql).all(...params) as WmsReportRow[];
  return rows.map(reportRowToModel);
}

/** 根据 ID 查询单条报表记录 */
export function getReportById(id: number): WmsReport | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM wms_reports WHERE id = ?').get(id) as WmsReportRow | undefined;
  return row ? reportRowToModel(row) : undefined;
}

/**
 * 生成库存报表 CSV 文件。
 * 从 inventory_items 表中导出数据到 ~/.cdf-know-clow/reports/ 目录。
 *
 * @returns 报表记录
 */
export function generateInventoryReport(params?: {
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
  generatedBy?: string;
}): WmsReport {
  const db = initDb();
  const reportsDir = path.join(os.homedir(), '.cdf-know-clow', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 查询库存数据
  let sql = 'SELECT * FROM inventory_items WHERE 1=1';
  const queryParams: unknown[] = [];
  if (params?.warehouseId) {
    sql += ' AND warehouseId = ?';
    queryParams.push(params.warehouseId);
  }
  if (params?.startDate) {
    sql += ' AND inboundDate >= ?';
    queryParams.push(params.startDate);
  }
  if (params?.endDate) {
    sql += ' AND inboundDate <= ?';
    queryParams.push(params.endDate);
  }
  const items = db.prepare(sql).all(...queryParams) as Array<Record<string, unknown>>;

  // 生成 CSV 内容
  const headers = ['sku', 'name', 'warehouseId', 'quantity', 'volumePerUnit', 'totalVolume', 'inboundDate', 'valuePerUnit', 'totalValue', 'category'];
  const csvLines: string[] = [headers.join(',')];
  for (const item of items) {
    const row = headers.map(h => {
      const val = item[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    });
    csvLines.push(row.join(','));
  }

  // 写入文件
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `inventory_report_${timestamp}.csv`;
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, csvLines.join('\n'), 'utf-8');

  // 创建报表记录
  const reportId = createReport({
    reportType: 'inventory',
    warehouseId: params?.warehouseId,
    startDate: params?.startDate,
    endDate: params?.endDate,
    filePath,
    fileFormat: 'csv',
    generatedBy: params?.generatedBy,
    generatedAt: new Date().toISOString(),
    status: 'completed',
  });

  const report = getReportById(reportId);
  if (!report) {
    throw new Error('报表创建后查询失败');
  }
  return report;
}
