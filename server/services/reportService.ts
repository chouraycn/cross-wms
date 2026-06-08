/**
 * Report Service
 *
 * CSV 报表生成服务，负责生成库存、入库、出库报表。
 * 支持按仓库、日期范围筛选，CSV 文件保存至 ~/.cdf-know-clow/reports/ 目录。
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ===================== 常量定义 =====================

const REPORTS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cdf-know-clow', 'reports');
const UTF8_BOM = '\uFEFF';

// ===================== 工具函数 =====================

/**
 * 确保报表目录存在
 */
function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

/**
 * 生成报表文件名
 * @param reportType 报表类型
 * @param warehouseId 仓库 ID（可选）
 * @returns 文件名
 */
function generateFileName(reportType: string, warehouseId?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const warehouseStr = warehouseId || 'all';
  return `${reportType}_${warehouseStr}_${timestamp}.csv`;
}

/**
 * 将数组转换为 CSV 格式（含 UTF-8 BOM）
 * @param headers 表头
 * @param rows 数据行
 * @returns CSV 字符串
 */
function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const escapeCSV = (field: unknown): string => {
    const str = String(field ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = headers.map(escapeCSV).join(',');
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeCSV(row[h])).join(',')
  );

  return UTF8_BOM + [headerRow, ...dataRows].join('\n');
}

/**
 * 写入报表记录到数据库
 * @param db 数据库实例
 * @param reportType 报表类型
 * @param warehouseId 仓库 ID
 * @param filePath 文件路径
 * @param recordCount 记录数
 */
function saveReportRecord(
  db: Database.Database,
  reportType: string,
  warehouseId: string | null,
  filePath: string,
  recordCount: number
): void {
  const stmt = db.prepare(`
    INSERT INTO wms_reports (
      report_type,
      warehouse_id,
      file_path,
      record_count,
      generated_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
  `);

  stmt.run(
    reportType,
    warehouseId,
    filePath,
    recordCount
  );
}

// ===================== 核心函数 =====================

/**
 * 生成库存报表
 * @param db 数据库实例
 * @param warehouseId 仓库 ID（可选，不传则查询所有仓库）
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 生成的报表文件路径
 */
export function generateInventoryReport(
  db: Database.Database,
  warehouseId?: string,
  startDate?: string,
  endDate?: string
): string {
  ensureReportsDir();

  // 构建查询
  let query = `
    SELECT
      ii.sku,
      ii.name,
      ii.warehouse_id,
      w.name as warehouse_name,
      ii.quantity,
      ii.unit_price,
      ii.total_value,
      ii.total_volume,
      ii.location,
      ii.expiry_date,
      ii.updated_at
    FROM inventory_items ii
    LEFT JOIN warehouses w ON ii.warehouse_id = w.id
    WHERE 1=1
  `;

  const params: unknown[] = [];

  if (warehouseId) {
    query += ` AND ii.warehouse_id = ?`;
    params.push(warehouseId);
  }

  if (startDate) {
    query += ` AND ii.updated_at >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND ii.updated_at <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY ii.warehouse_id, ii.sku`;

  const items = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  // 定义表头
  const headers = [
    'sku',
    'name',
    'warehouse_id',
    'warehouse_name',
    'quantity',
    'unit_price',
    'total_value',
    'total_volume',
    'location',
    'expiry_date',
    'updated_at',
  ];

  // 生成 CSV
  const csv = toCSV(headers, items);
  const fileName = generateFileName('inventory', warehouseId);
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, csv, 'utf-8');

  // 保存记录到数据库
  saveReportRecord(db, 'inventory', warehouseId || null, filePath, items.length);

  return filePath;
}

/**
 * 生成入库报表
 * @param db 数据库实例
 * @param warehouseId 仓库 ID（可选）
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 生成的报表文件路径
 */
export function generateInboundReport(
  db: Database.Database,
  warehouseId?: string,
  startDate?: string,
  endDate?: string
): string {
  ensureReportsDir();

  // 构建查询
  let query = `
    SELECT
      ir.id,
      ir.warehouse_id,
      w.name as warehouse_name,
      ir.sku,
      ii.name as product_name,
      ir.quantity,
      ir.operator,
      ir.remarks,
      ir.created_at
    FROM inbound_records ir
    LEFT JOIN warehouses w ON ir.warehouse_id = w.id
    LEFT JOIN inventory_items ii ON ir.sku = ii.sku
    WHERE 1=1
  `;

  const params: unknown[] = [];

  if (warehouseId) {
    query += ` AND ir.warehouse_id = ?`;
    params.push(warehouseId);
  }

  if (startDate) {
    query += ` AND ir.created_at >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND ir.created_at <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY ir.created_at DESC`;

  const items = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  // 定义表头
  const headers = [
    'id',
    'warehouse_id',
    'warehouse_name',
    'sku',
    'product_name',
    'quantity',
    'operator',
    'remarks',
    'created_at',
  ];

  // 生成 CSV
  const csv = toCSV(headers, items);
  const fileName = generateFileName('inbound', warehouseId);
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, csv, 'utf-8');

  // 保存记录到数据库
  saveReportRecord(db, 'inbound', warehouseId || null, filePath, items.length);

  return filePath;
}

/**
 * 生成出库报表
 * @param db 数据库实例
 * @param warehouseId 仓库 ID（可选）
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 生成的报表文件路径
 */
export function generateOutboundReport(
  db: Database.Database,
  warehouseId?: string,
  startDate?: string,
  endDate?: string
): string {
  ensureReportsDir();

  // 构建查询
  let query = `
    SELECT
      or.id,
      or.warehouse_id,
      w.name as warehouse_name,
      or.sku,
      ii.name as product_name,
      or.quantity,
      or.operator,
      or.remarks,
      or.created_at
    FROM outbound_records or
    LEFT JOIN warehouses w ON or.warehouse_id = w.id
    LEFT JOIN inventory_items ii ON or.sku = ii.sku
    WHERE 1=1
  `;

  const params: unknown[] = [];

  if (warehouseId) {
    query += ` AND or.warehouse_id = ?`;
    params.push(warehouseId);
  }

  if (startDate) {
    query += ` AND or.created_at >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND or.created_at <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY or.created_at DESC`;

  const items = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  // 定义表头
  const headers = [
    'id',
    'warehouse_id',
    'warehouse_name',
    'sku',
    'product_name',
    'quantity',
    'operator',
    'remarks',
    'created_at',
  ];

  // 生成 CSV
  const csv = toCSV(headers, items);
  const fileName = generateFileName('outbound', warehouseId);
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, csv, 'utf-8');

  // 保存记录到数据库
  saveReportRecord(db, 'outbound', warehouseId || null, filePath, items.length);

  return filePath;
}

/**
 * 获取报表列表
 * @param db 数据库实例
 * @returns 报表记录列表
 */
export function getReportList(db: Database.Database): Array<Record<string, unknown>> {
  const stmt = db.prepare(`
    SELECT
      id,
      report_type,
      warehouse_id,
      file_path,
      record_count,
      generated_at,
      created_at
    FROM wms_reports
    ORDER BY generated_at DESC
    LIMIT 100
  `);

  return stmt.all() as Array<Record<string, unknown>>;
}

/**
 * 删除报表记录及文件
 * @param db 数据库实例
 * @param reportId 报表 ID
 * @returns 是否删除成功
 */
export function deleteReport(db: Database.Database, reportId: number): boolean {
  // 先查询文件路径
  const stmt = db.prepare('SELECT file_path FROM wms_reports WHERE id = ?');
  const record = stmt.get(reportId) as { file_path: string } | undefined;

  if (!record) {
    return false;
  }

  // 删除文件
  try {
    if (fs.existsSync(record.file_path)) {
      fs.unlinkSync(record.file_path);
    }
  } catch (err) {
    console.error('删除报表文件失败:', err);
  }

  // 删除数据库记录
  const deleteStmt = db.prepare('DELETE FROM wms_reports WHERE id = ?');
  const result = deleteStmt.run(reportId);

  return result.changes > 0;
}
