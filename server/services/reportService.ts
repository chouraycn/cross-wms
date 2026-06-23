/**
 * Report Service
 *
 * CSV 报表生成服务，负责生成库存、入库、出库报表。
 * 支持按仓库、日期范围筛选，CSV 文件保存至 ~/.cdf-know-clow/reports/ 目录。
 *
 * v10.0: 改为使用 DAO 层，彻底弃用 SQLite 直接查询
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { createReport, getReports, getReportById, deleteReport as daoDeleteReport } from '../dao/wmsSkillDao.js';
import { getInventoryItems, getInboundRecords, getOutboundRecords, getWarehouseById } from '../dao/warehouse.js';

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

// ===================== 核心函数 =====================

/**
 * 生成库存报表
 * @param warehouseId 仓库 ID（可选，不传则查询所有仓库）
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 生成的报表文件路径
 */
export function generateInventoryReport(
  warehouseId?: string,
  startDate?: string,
  endDate?: string
): string {
  ensureReportsDir();

  // 使用 DAO 获取库存数据
  const items = getInventoryItems(warehouseId).filter((item) => {
    const updatedAt = String(item.updatedAt || '');
    if (startDate && updatedAt < startDate) return false;
    if (endDate && updatedAt > endDate + 'T23:59:59.999Z') return false;
    return true;
  });

  // 构建报表行（JOIN warehouses 获取仓库名称）
  const rows = items.map((item) => {
    const warehouse = getWarehouseById(String(item.warehouseId || ''));
    return {
      sku: item.sku,
      name: item.name,
      warehouse_id: item.warehouseId,
      warehouse_name: warehouse?.name || '',
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_value: item.totalValue,
      total_volume: item.totalVolume,
      location: item.location,
      expiry_date: item.expiryDate,
      updated_at: item.updatedAt,
    };
  });

  // 按仓库+SKU排序
  rows.sort((a, b) => {
    const wa = String(a.warehouse_id);
    const wb = String(b.warehouse_id);
    if (wa !== wb) return wa.localeCompare(wb);
    return String(a.sku).localeCompare(String(b.sku));
  });

  // 定义表头
  const headers = [
    'sku', 'name', 'warehouse_id', 'warehouse_name', 'quantity',
    'unit_price', 'total_value', 'total_volume', 'location',
    'expiry_date', 'updated_at',
  ];

  // 生成 CSV
  const csv = toCSV(headers, rows);
  const fileName = generateFileName('inventory', warehouseId);
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, csv, 'utf-8');

  // 保存记录到数据库（使用 DAO）
  createReport({
    reportType: 'inventory',
    warehouseId: warehouseId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    filePath,
    fileFormat: 'csv',
    generatedBy: undefined,
    generatedAt: new Date().toISOString(),
    status: 'completed',
  });

  return filePath;
}

/**
 * 生成入库报表
 * @param warehouseId 仓库 ID（可选）
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 生成的报表文件路径
 */
export function generateInboundReport(
  warehouseId?: string,
  startDate?: string,
  endDate?: string
): string {
  ensureReportsDir();

  // 使用 DAO 获取入库记录
  const records = getInboundRecords(warehouseId, startDate, endDate);

  // 构建报表行（JOIN warehouses + inventory_items）
  const rows = records.map((record) => {
    const warehouse = getWarehouseById(record.warehouseId);
    const items = getInventoryItems(record.warehouseId);
    const product = items.find((i) => i.sku === record.sku);
    return {
      id: record.id,
      warehouse_id: record.warehouseId,
      warehouse_name: warehouse?.name || '',
      sku: record.sku,
      product_name: product?.name || '',
      quantity: record.quantity,
      operator: record.operator,
      remarks: (record as unknown as Record<string, unknown>).remarks ?? '',
      created_at: record.createdAt,
    };
  });

  // 定义表头
  const headers = [
    'id', 'warehouse_id', 'warehouse_name', 'sku', 'product_name',
    'quantity', 'operator', 'remarks', 'created_at',
  ];

  // 生成 CSV
  const csv = toCSV(headers, rows);
  const fileName = generateFileName('inbound', warehouseId);
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, csv, 'utf-8');

  // 保存记录到数据库（使用 DAO）
  createReport({
    reportType: 'inbound',
    warehouseId: warehouseId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    filePath,
    fileFormat: 'csv',
    generatedBy: undefined,
    generatedAt: new Date().toISOString(),
    status: 'completed',
  });

  return filePath;
}

/**
 * 生成出库报表
 * @param warehouseId 仓库 ID（可选）
 * @param startDate 开始日期（可选）
 * @param endDate 结束日期（可选）
 * @returns 生成的报表文件路径
 */
export function generateOutboundReport(
  warehouseId?: string,
  startDate?: string,
  endDate?: string
): string {
  ensureReportsDir();

  // 使用 DAO 获取出库记录
  const records = getOutboundRecords(warehouseId, startDate, endDate);

  // 构建报表行（JOIN warehouses + inventory_items）
  const rows = records.map((record) => {
    const warehouse = getWarehouseById(record.warehouseId);
    const items = getInventoryItems(record.warehouseId);
    const product = items.find((i) => i.sku === record.sku);
    return {
      id: record.id,
      warehouse_id: record.warehouseId,
      warehouse_name: warehouse?.name || '',
      sku: record.sku,
      product_name: product?.name || '',
      quantity: record.quantity,
      operator: record.operator,
      remarks: (record as unknown as Record<string, unknown>).remarks ?? '',
      created_at: record.createdAt,
    };
  });

  // 定义表头
  const headers = [
    'id', 'warehouse_id', 'warehouse_name', 'sku', 'product_name',
    'quantity', 'operator', 'remarks', 'created_at',
  ];

  // 生成 CSV
  const csv = toCSV(headers, rows);
  const fileName = generateFileName('outbound', warehouseId);
  const filePath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(filePath, csv, 'utf-8');

  // 保存记录到数据库（使用 DAO）
  createReport({
    reportType: 'outbound',
    warehouseId: warehouseId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    filePath,
    fileFormat: 'csv',
    generatedBy: undefined,
    generatedAt: new Date().toISOString(),
    status: 'completed',
  });

  return filePath;
}

/**
 * 获取报表列表
 * @returns 报表记录列表
 */
export function getReportList(): Array<Record<string, unknown>> {
  const reports = getReports();
  return reports.map(r => ({
    id: r.id,
    report_type: r.reportType,
    warehouse_id: r.warehouseId,
    file_path: r.filePath,
    record_count: null,
    generated_at: r.generatedAt,
    created_at: r.createdAt,
  }));
}

/**
 * 删除报表记录及文件
 * @param reportId 报表 ID
 * @returns 是否删除成功
 */
export function deleteReport(reportId: number): boolean {
  // 先查询文件路径
  const record = getReportById(reportId);

  if (!record) {
    return false;
  }

  // 删除文件
  try {
    if (record.filePath && fs.existsSync(record.filePath)) {
      fs.unlinkSync(record.filePath);
    }
  } catch (err) {
    logger.error('删除报表文件失败:', err);
  }

  // 删除数据库记录（使用 DAO）
  return daoDeleteReport(reportId);
}
