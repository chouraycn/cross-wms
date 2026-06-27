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
 * 所有方法使用 WmsFileStorage 同步 API。
 */
import { WmsFileStorage } from '../storage/WmsFileStorage.js';
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
import { AppPaths } from '../config/appPaths.js';

const wms = WmsFileStorage.getInstance();

// ===================== 初始化 WMS 表 =====================

/**
 * 确保 WMS 技能相关的表已创建（文件存储无需建表，空操作）。
 */
export function ensureWmsTables(): void {
  // no-op: 文件存储不需要建表
}

// ===================== 质检（Quality Check）DAO =====================

/** 创建质检记录，返回自增 ID */
export function createQualityCheck(check: Omit<QualityCheck, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_quality_checks');
  const row: QualityCheckRow = {
    id,
    warehouse_id: check.warehouseId,
    sku: check.sku,
    product_name: check.productName ?? null,
    batch_no: check.batchNo ?? null,
    expiry_date: check.expiryDate ?? null,
    expected_quantity: check.expectedQuantity,
    actual_quantity: check.actualQuantity,
    quality_status: check.qualityStatus,
    inspector: check.inspector ?? null,
    check_time: check.checkTime ?? null,
    notes: check.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  wms.create<QualityCheckRow>('wms_quality_checks', id, row);
  return id;
}

/** 查询质检记录，支持 warehouseId / qualityStatus / sku 过滤 */
export function getQualityChecks(filters?: {
  warehouseId?: string;
  qualityStatus?: string;
  sku?: string;
}): QualityCheck[] {
  let rows = wms.list<QualityCheckRow>('wms_quality_checks');
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.qualityStatus) {
    rows = rows.filter((r) => r.quality_status === filters.qualityStatus);
  }
  if (filters?.sku) {
    rows = rows.filter((r) => r.sku.includes(filters.sku!));
  }
  rows = rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  return rows.map(qualityCheckRowToModel);
}

/** 根据 ID 查询单条质检记录 */
export function getQualityCheckById(id: number): QualityCheck | undefined {
  const row = wms.get<QualityCheckRow>('wms_quality_checks', id);
  return row ? qualityCheckRowToModel(row) : undefined;
}

/** 更新质检记录 */
export function updateQualityCheck(id: number, updates: Partial<QualityCheck>): boolean {
  const existing = wms.get<QualityCheckRow>('wms_quality_checks', id);
  if (!existing) return false;
  const now = new Date().toISOString();
  const merged = { ...qualityCheckRowToModel(existing), ...updates, updatedAt: now };
  const row: QualityCheckRow = {
    id,
    warehouse_id: merged.warehouseId,
    sku: merged.sku,
    product_name: merged.productName ?? null,
    batch_no: merged.batchNo ?? null,
    expiry_date: merged.expiryDate ?? null,
    expected_quantity: merged.expectedQuantity,
    actual_quantity: merged.actualQuantity,
    quality_status: merged.qualityStatus,
    inspector: merged.inspector ?? null,
    check_time: merged.checkTime ?? null,
    notes: merged.notes ?? null,
    created_at: existing.created_at,
    updated_at: now,
  };
  wms.update<QualityCheckRow>('wms_quality_checks', id, row);
  return true;
}

/** 删除质检记录 */
export function deleteQualityCheck(id: number): boolean {
  return wms.delete('wms_quality_checks', id);
}

// ===================== 盘点（Inventory Count）DAO =====================

/** 创建盘点记录，返回自增 ID */
export function createInventoryCount(count: Omit<InventoryCount, 'id' | 'variance' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_inventory_counts');
  const row: InventoryCountRow = {
    id,
    warehouse_id: count.warehouseId,
    location_code: count.locationCode,
    sku: count.sku,
    system_quantity: count.systemQuantity,
    actual_quantity: count.actualQuantity,
    variance: count.actualQuantity - count.systemQuantity,
    counter: count.counter ?? null,
    count_time: count.countTime ?? null,
    status: count.status,
    notes: count.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  wms.create<InventoryCountRow>('wms_inventory_counts', id, row);
  return id;
}

/** 查询盘点记录，支持 warehouseId / status / sku / locationCode 过滤 */
export function getInventoryCounts(filters?: {
  warehouseId?: string;
  status?: string;
  sku?: string;
  locationCode?: string;
}): InventoryCount[] {
  let rows = wms.list<InventoryCountRow>('wms_inventory_counts');
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }
  if (filters?.sku) {
    rows = rows.filter((r) => r.sku.includes(filters.sku!));
  }
  if (filters?.locationCode) {
    rows = rows.filter((r) => r.location_code.includes(filters.locationCode!));
  }
  rows = rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  return rows.map(inventoryCountRowToModel);
}

/** 根据 ID 查询单条盘点记录 */
export function getInventoryCountById(id: number): InventoryCount | undefined {
  const row = wms.get<InventoryCountRow>('wms_inventory_counts', id);
  return row ? inventoryCountRowToModel(row) : undefined;
}

/** 更新盘点记录 */
export function updateInventoryCount(id: number, updates: Partial<InventoryCount>): boolean {
  const existing = wms.get<InventoryCountRow>('wms_inventory_counts', id);
  if (!existing) return false;
  const now = new Date().toISOString();
  const merged = { ...inventoryCountRowToModel(existing), ...updates, updatedAt: now };
  const row: InventoryCountRow = {
    id,
    warehouse_id: merged.warehouseId,
    location_code: merged.locationCode,
    sku: merged.sku,
    system_quantity: merged.systemQuantity,
    actual_quantity: merged.actualQuantity,
    variance: merged.actualQuantity - merged.systemQuantity,
    counter: merged.counter ?? null,
    count_time: merged.countTime ?? null,
    status: merged.status,
    notes: merged.notes ?? null,
    created_at: existing.created_at,
    updated_at: now,
  };
  wms.update<InventoryCountRow>('wms_inventory_counts', id, row);
  return true;
}

/**
 * 盘点差异调整 — 同时更新盘点记录状态为 adjusted，
 * 并更新 inventory_items 表中对应 SKU 的数量为实际盘点的数量。
 *
 * @returns 调整后的盘点记录，若失败返回 undefined
 */
export function adjustInventoryCount(id: number, adjustedBy?: string): InventoryCount | undefined {
  const existing = wms.get<InventoryCountRow>('wms_inventory_counts', id);
  if (!existing) return undefined;

  const model = inventoryCountRowToModel(existing);
  if (model.status === 'adjusted') {
    return model; // 已调整，直接返回
  }

  const now = new Date().toISOString();

  // 更新盘点状态为 adjusted
  const updatedNotes = `${model.notes ? model.notes + '; ' : ''}adjusted by ${adjustedBy ?? 'system'}`;
  const updatedRow: InventoryCountRow = {
    ...existing,
    status: 'adjusted',
    notes: updatedNotes,
    updated_at: now,
  };
  wms.update<InventoryCountRow>('wms_inventory_counts', id, updatedRow);

  // 同步更新 inventory_items 中的库存数量
  const items = wms.list<Record<string, unknown>>('inventory_items');
  const itemIndex = items.findIndex((item) => item.sku === model.sku && item.warehouseId === model.warehouseId);
  if (itemIndex !== -1) {
    items[itemIndex] = { ...items[itemIndex], quantity: model.actualQuantity };
    wms.list<Record<string, unknown>>('inventory_items'); // trigger read to get file ref
    const fs2 = require('fs');
    const path2 = require('path');
    const filePath = path2.join(AppPaths.wmsDataDir, 'inventory_items.json');
    const raw = JSON.parse(fs2.readFileSync(filePath, 'utf-8') || '{"items":[]}') as { items: Record<string, unknown>[]; lastId?: number };
    raw.items[itemIndex] = items[itemIndex];
    fs2.writeFileSync(filePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  }

  // 记录库存事务
  const variance = model.actualQuantity - model.systemQuantity;
  if (variance !== 0) {
    const txId = wms.nextId('inventory_transactions');
    wms.create<Record<string, unknown>>('inventory_transactions', txId, {
      id: txId,
      sku: model.sku,
      type: 'adjustment',
      quantity: Math.abs(variance),
      warehouseId: model.warehouseId,
      operator: adjustedBy ?? 'system',
      sourceId: String(id),
      sourceType: 'inventory_count',
      remark: `盘差调整: ${variance > 0 ? '+' : ''}${variance}`,
      createdAt: now,
    });
  }

  return getInventoryCountById(id);
}

// ===================== 出库复核（Outbound Review）DAO =====================

/** 创建出库复核记录，返回自增 ID */
export function createOutboundReview(review: Omit<OutboundReview, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_outbound_reviews');
  const row: OutboundReviewRow = {
    id,
    outbound_order_id: review.outboundOrderId,
    warehouse_id: review.warehouseId,
    sku: review.sku,
    product_name: review.productName ?? null,
    expected_quantity: review.expectedQuantity,
    scanned_quantity: review.scannedQuantity,
    review_status: review.reviewStatus,
    reviewer: review.reviewer ?? null,
    review_time: review.reviewTime ?? null,
    notes: review.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  wms.create<OutboundReviewRow>('wms_outbound_reviews', id, row);
  return id;
}

/** 查询出库复核记录，支持 warehouseId / reviewStatus / outboundOrderId / sku 过滤 */
export function getOutboundReviews(filters?: {
  warehouseId?: string;
  reviewStatus?: string;
  outboundOrderId?: string;
  sku?: string;
}): OutboundReview[] {
  let rows = wms.list<OutboundReviewRow>('wms_outbound_reviews');
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.reviewStatus) {
    rows = rows.filter((r) => r.review_status === filters.reviewStatus);
  }
  if (filters?.outboundOrderId) {
    rows = rows.filter((r) => r.outbound_order_id === filters.outboundOrderId);
  }
  if (filters?.sku) {
    rows = rows.filter((r) => r.sku.includes(filters.sku!));
  }
  rows = rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  return rows.map(outboundReviewRowToModel);
}

/** 根据 ID 查询单条出库复核记录 */
export function getOutboundReviewById(id: number): OutboundReview | undefined {
  const row = wms.get<OutboundReviewRow>('wms_outbound_reviews', id);
  return row ? outboundReviewRowToModel(row) : undefined;
}

/** 更新出库复核记录 */
export function updateOutboundReview(id: number, updates: Partial<OutboundReview>): boolean {
  const existing = wms.get<OutboundReviewRow>('wms_outbound_reviews', id);
  if (!existing) return false;
  const now = new Date().toISOString();
  const merged = { ...outboundReviewRowToModel(existing), ...updates, updatedAt: now };
  const row: OutboundReviewRow = {
    id,
    outbound_order_id: merged.outboundOrderId,
    warehouse_id: merged.warehouseId,
    sku: merged.sku,
    product_name: merged.productName ?? null,
    expected_quantity: merged.expectedQuantity,
    scanned_quantity: merged.scannedQuantity,
    review_status: merged.reviewStatus,
    reviewer: merged.reviewer ?? null,
    review_time: merged.reviewTime ?? null,
    notes: merged.notes ?? null,
    created_at: existing.created_at,
    updated_at: now,
  };
  wms.update<OutboundReviewRow>('wms_outbound_reviews', id, row);
  return true;
}

// ===================== 异常预警（Alert）DAO =====================

/** 创建预警记录，返回自增 ID */
export function createAlert(alert: Omit<WmsAlert, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_alerts');
  const row: WmsAlertRow = {
    id,
    warehouse_id: alert.warehouseId,
    alert_type: alert.alertType,
    severity: alert.severity,
    sku: alert.sku ?? null,
    message: alert.message,
    triggered_at: alert.triggeredAt ?? now,
    resolved_at: null,
    status: alert.status,
    created_at: now,
    updated_at: now,
  };
  wms.create<WmsAlertRow>('wms_alerts', id, row);
  return id;
}

/** 查询预警记录，支持 warehouseId / alertType / severity / status 过滤 */
export function getAlerts(filters?: {
  warehouseId?: string;
  alertType?: string;
  severity?: string;
  status?: string;
}): WmsAlert[] {
  let rows = wms.list<WmsAlertRow>('wms_alerts');
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.alertType) {
    rows = rows.filter((r) => r.alert_type === filters.alertType);
  }
  if (filters?.severity) {
    rows = rows.filter((r) => r.severity === filters.severity);
  }
  if (filters?.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }
  rows = rows.sort((a, b) => ((a.triggered_at ?? '') > (b.triggered_at ?? '') ? -1 : 1));
  return rows.map(alertRowToModel);
}

/** 根据 ID 查询单条预警记录 */
export function getAlertById(id: number): WmsAlert | undefined {
  const row = wms.get<WmsAlertRow>('wms_alerts', id);
  return row ? alertRowToModel(row) : undefined;
}

/** 解决预警（标记为 resolved 或 ignored） */
export function resolveAlert(id: number, resolution: 'resolved' | 'ignored'): boolean {
  const existing = wms.get<WmsAlertRow>('wms_alerts', id);
  if (!existing) return false;
  const now = new Date().toISOString();
  const row: WmsAlertRow = {
    ...existing,
    status: resolution,
    resolved_at: now,
    updated_at: now,
  };
  wms.update<WmsAlertRow>('wms_alerts', id, row);
  return true;
}

/**
 * 执行预警检查 — 扫描 inventory_items 表中库存低于阈值的 SKU，
 * 以及临期/滞留商品，生成预警记录。
 *
 * @returns 新生成的预警数量
 */
export function checkAlerts(warehouseId?: string, lowStockThreshold: number = 10): number {
  let count = 0;
  const now = new Date().toISOString();

  // 1. 低库存预警
  let lowStockItems = wms.list<Record<string, unknown>>('inventory_items').filter((item) => (item.quantity as number) < lowStockThreshold);
  if (warehouseId) {
    lowStockItems = lowStockItems.filter((item) => item.warehouseId === warehouseId);
  }
  for (const item of lowStockItems) {
    const qty = item.quantity as number;
    createAlert({
      warehouseId: item.warehouseId as string,
      alertType: 'low_stock',
      severity: qty === 0 ? 'critical' : qty < 5 ? 'high' : 'medium',
      sku: item.sku as string,
      message: `库存不足: SKU ${item.sku} 当前库存 ${qty}，低于阈值 ${lowStockThreshold}`,
      status: 'active',
    });
    count++;
  }

  // 2. 临期预警 — 检查入库质检中 30 天内过期的记录
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  let expiryItems = wms
    .list<QualityCheckRow>('wms_quality_checks')
    .filter((item) => item.expiry_date != null && item.expiry_date <= thirtyDaysLater && item.quality_status !== 'unqualified');
  if (warehouseId) {
    expiryItems = expiryItems.filter((item) => item.warehouse_id === warehouseId);
  }
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

// ===================== 补货规则（Replenishment Rule）DAO =====================

/** 创建补货规则，返回自增 ID */
export function createReplenishmentRule(rule: {
  sku: string;
  warehouseId: string;
  minStock: number;
  maxStock?: number | null;
  safetyDays?: number;
  replenishMultiplier?: number;
  supplierId?: string | null;
  leadTimeDays?: number | null;
  autoOrder?: boolean;
  status?: string;
}): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_replenishment_rules');
  const row: Record<string, unknown> = {
    id,
    sku: rule.sku,
    warehouse_id: rule.warehouseId,
    min_stock: rule.minStock,
    max_stock: rule.maxStock ?? null,
    safety_days: rule.safetyDays ?? 7,
    replenish_multiplier: rule.replenishMultiplier ?? 1.5,
    supplier_id: rule.supplierId ?? null,
    lead_time_days: rule.leadTimeDays ?? null,
    auto_order: rule.autoOrder ? 1 : 0,
    status: rule.status ?? 'active',
    created_at: now,
    updated_at: now,
  };
  wms.create<Record<string, unknown>>('wms_replenishment_rules', id, row);
  return id;
}

/** 查询补货规则，支持 sku / warehouseId / status 过滤 */
export function getReplenishmentRules(filters?: {
  sku?: string;
  warehouseId?: string;
  status?: string;
}): Array<Record<string, unknown>> {
  let rows = wms.list<Record<string, unknown>>('wms_replenishment_rules');
  if (filters?.sku) {
    rows = rows.filter((r) => r.sku === filters.sku);
  }
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }
  rows = rows.sort((a, b) => ((a.updated_at as string) > (b.updated_at as string) ? -1 : 1));
  return rows;
}

/** 根据 ID 查询单条补货规则 */
export function getReplenishmentRuleById(id: number): Record<string, unknown> | undefined {
  return wms.get<Record<string, unknown>>('wms_replenishment_rules', id);
}

/** 根据 sku + warehouseId 查询补货规则 */
export function getReplenishmentRuleBySkuAndWarehouse(sku: string, warehouseId: string): Record<string, unknown> | undefined {
  return wms.findOne<Record<string, unknown>>('wms_replenishment_rules', (r) => r.sku === sku && r.warehouse_id === warehouseId);
}

/** 更新补货规则 */
export function updateReplenishmentRule(id: number, updates: Record<string, unknown>): boolean {
  const existing = wms.get<Record<string, unknown>>('wms_replenishment_rules', id);
  if (!existing) return false;
  const now = new Date().toISOString();

  const fieldMap: Record<string, string> = {
    sku: 'sku',
    warehouseId: 'warehouse_id',
    minStock: 'min_stock',
    maxStock: 'max_stock',
    safetyDays: 'safety_days',
    replenishMultiplier: 'replenish_multiplier',
    supplierId: 'supplier_id',
    leadTimeDays: 'lead_time_days',
    autoOrder: 'auto_order',
    status: 'status',
  };

  const merged: Record<string, unknown> = { ...existing };
  for (const [key, col] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      merged[col] = updates[key];
    }
  }
  merged.updated_at = now;
  wms.update<Record<string, unknown>>('wms_replenishment_rules', id, merged);
  return true;
}

/** 删除补货规则 */
export function deleteReplenishmentRule(id: number): boolean {
  return wms.delete('wms_replenishment_rules', id);
}

// ===================== 需求预测（Demand Forecast）DAO =====================

/** 创建需求预测，返回自增 ID */
export function createDemandForecast(forecast: {
  sku: string;
  warehouseId: string;
  forecastDate: string;
  forecastDays: number;
  predictedDemand: number;
  confidenceLevel: number;
  modelVersion: string;
  status: string;
}): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_demand_forecasts');
  const row: Record<string, unknown> = {
    id,
    sku: forecast.sku,
    warehouse_id: forecast.warehouseId,
    forecast_date: forecast.forecastDate,
    forecast_days: forecast.forecastDays,
    predicted_demand: forecast.predictedDemand,
    confidence_level: forecast.confidenceLevel,
    model_version: forecast.modelVersion,
    status: forecast.status,
    created_at: now,
    updated_at: now,
  };
  wms.create<Record<string, unknown>>('wms_demand_forecasts', id, row);
  return id;
}

/** 查询需求预测，支持 sku / warehouseId / status 过滤 */
export function getDemandForecasts(filters?: {
  sku?: string;
  warehouseId?: string;
  status?: string;
}): Array<Record<string, unknown>> {
  let rows = wms.list<Record<string, unknown>>('wms_demand_forecasts');
  if (filters?.sku) {
    rows = rows.filter((r) => r.sku === filters.sku);
  }
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }
  rows = rows.sort((a, b) => ((a.created_at as string) > (b.created_at as string) ? -1 : 1));
  return rows;
}

/** 根据 ID 查询单条需求预测 */
export function getDemandForecastById(id: number): Record<string, unknown> | undefined {
  return wms.get<Record<string, unknown>>('wms_demand_forecasts', id);
}

/** 更新预测状态 */
export function updateDemandForecastStatus(id: number, status: string): boolean {
  const existing = wms.get<Record<string, unknown>>('wms_demand_forecasts', id);
  if (!existing) return false;
  const now = new Date().toISOString();
  wms.update<Record<string, unknown>>('wms_demand_forecasts', id, {
    ...existing,
    status,
    updated_at: now,
  });
  return true;
}

/** 删除预测 */
export function deleteDemandForecast(id: number): boolean {
  return wms.delete('wms_demand_forecasts', id);
}

// ===================== 预警扩展 DAO =====================

/** 更新预警状态（解决/忽略） */
export function updateAlertStatus(id: number, status: string, resolvedAt?: string | null): boolean {
  const existing = wms.get<WmsAlertRow>('wms_alerts', id);
  if (!existing) return false;
  const now = new Date().toISOString();
  const row: WmsAlertRow = {
    ...existing,
    status,
    resolved_at: resolvedAt ?? now,
    updated_at: now,
  };
  wms.update<WmsAlertRow>('wms_alerts', id, row);
  return true;
}

/** 删除预警 */
export function deleteAlert(id: number): boolean {
  return wms.delete('wms_alerts', id);
}

/** 清理已解决的预警（超过指定天数） */
export function cleanResolvedAlerts(days: number): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  const rows = wms.list<WmsAlertRow>('wms_alerts');
  const toDelete = rows.filter((r) => r.status === 'resolved' && r.resolved_at && r.resolved_at < cutoff);
  for (const r of toDelete) {
    wms.delete('wms_alerts', r.id);
  }
  return toDelete.length;
}

// ===================== 报表数据查询 DAO =====================

/** 查询库存报表数据（含仓库名称） */
export function queryInventoryReportData(filters?: {
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
}): Array<Record<string, unknown>> {
  const warehouses = wms.list<Record<string, unknown>>('warehouses');
  const warehouseMap = new Map<string, string>();
  for (const w of warehouses) {
    warehouseMap.set(w.id as string, w.name as string);
  }

  let items = wms.list<Record<string, unknown>>('inventory_items');
  if (filters?.warehouseId) {
    items = items.filter((i) => i.warehouseId === filters.warehouseId);
  }
  if (filters?.startDate) {
    items = items.filter((i) => (i.updated_at as string | undefined) != null && (i.updated_at as string) >= filters.startDate!);
  }
  if (filters?.endDate) {
    items = items.filter((i) => (i.updated_at as string | undefined) != null && (i.updated_at as string) <= filters.endDate!);
  }

  items = items.sort((a, b) => {
    const wa = String(a.warehouseId ?? '');
    const wb = String(b.warehouseId ?? '');
    if (wa !== wb) return wa.localeCompare(wb);
    return String(a.sku ?? '').localeCompare(String(b.sku ?? ''));
  });

  return items.map((i) => ({
    sku: i.sku,
    name: i.name,
    warehouse_id: i.warehouseId,
    warehouse_name: warehouseMap.get(i.warehouseId as string) ?? '',
    quantity: i.quantity,
    unit_price: i.valuePerUnit,
    total_value: i.totalValue,
    total_volume: i.totalVolume,
    location: i.location,
    expiry_date: i.expiry_date,
    updated_at: i.updated_at,
  }));
}

/** 查询入库报表数据（含仓库名称和商品名称） */
export function queryInboundReportData(filters?: {
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
}): Array<Record<string, unknown>> {
  const warehouses = wms.list<Record<string, unknown>>('warehouses');
  const warehouseMap = new Map<string, string>();
  for (const w of warehouses) {
    warehouseMap.set(w.id as string, w.name as string);
  }
  const inventoryItems = wms.list<Record<string, unknown>>('inventory_items');
  const itemNameMap = new Map<string, string>();
  for (const ii of inventoryItems) {
    if (!itemNameMap.has(ii.sku as string)) {
      itemNameMap.set(ii.sku as string, ii.name as string);
    }
  }

  let records = wms.list<Record<string, unknown>>('inbound_records');
  if (filters?.warehouseId) {
    records = records.filter((r) => r.warehouseId === filters.warehouseId);
  }
  if (filters?.startDate) {
    records = records.filter((r) => (r.createdAt as string) >= filters.startDate!);
  }
  if (filters?.endDate) {
    records = records.filter((r) => (r.createdAt as string) <= filters.endDate!);
  }
  records = records.sort((a, b) => ((a.createdAt as string) > (b.createdAt as string) ? -1 : 1));

  return records.map((r) => ({
    id: r.id,
    warehouse_id: r.warehouseId,
    warehouse_name: warehouseMap.get(r.warehouseId as string) ?? '',
    sku: r.sku,
    product_name: itemNameMap.get(r.sku as string) ?? '',
    quantity: r.quantity,
    operator: r.operator,
    remarks: r.remarks,
    created_at: r.createdAt,
  }));
}

/** 查询出库报表数据（含仓库名称和商品名称） */
export function queryOutboundReportData(filters?: {
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
}): Array<Record<string, unknown>> {
  const warehouses = wms.list<Record<string, unknown>>('warehouses');
  const warehouseMap = new Map<string, string>();
  for (const w of warehouses) {
    warehouseMap.set(w.id as string, w.name as string);
  }
  const inventoryItems = wms.list<Record<string, unknown>>('inventory_items');
  const itemNameMap = new Map<string, string>();
  for (const ii of inventoryItems) {
    if (!itemNameMap.has(ii.sku as string)) {
      itemNameMap.set(ii.sku as string, ii.name as string);
    }
  }

  let records = wms.list<Record<string, unknown>>('outbound_records');
  if (filters?.warehouseId) {
    records = records.filter((r) => r.warehouseId === filters.warehouseId);
  }
  if (filters?.startDate) {
    records = records.filter((r) => (r.createdAt as string) >= filters.startDate!);
  }
  if (filters?.endDate) {
    records = records.filter((r) => (r.createdAt as string) <= filters.endDate!);
  }
  records = records.sort((a, b) => ((a.createdAt as string) > (b.createdAt as string) ? -1 : 1));

  return records.map((r) => ({
    id: r.id,
    warehouse_id: r.warehouseId,
    warehouse_name: warehouseMap.get(r.warehouseId as string) ?? '',
    sku: r.sku,
    product_name: itemNameMap.get(r.sku as string) ?? '',
    quantity: r.quantity,
    operator: r.operator,
    remarks: r.remarks,
    created_at: r.createdAt,
  }));
}

// ===================== 补货建议 DAO =====================

/** 创建补货建议 */
export function createReplenishmentSuggestion(suggestion: {
  sku: string;
  warehouseId: string;
  suggestedQty: number;
  reason?: string;
  status?: string;
}): number {
  const now = new Date().toISOString();
  const id = wms.nextId('replenishment_suggestions');
  const row: Record<string, unknown> = {
    id,
    sku: suggestion.sku,
    warehouse_id: suggestion.warehouseId,
    suggested_qty: suggestion.suggestedQty,
    reason: suggestion.reason ?? '',
    status: suggestion.status ?? 'pending',
    created_at: now,
    updated_at: now,
  };
  wms.create<Record<string, unknown>>('replenishment_suggestions', id, row);
  return id;
}

/** 查询补货建议列表 */
export function getReplenishmentSuggestions(filters?: {
  status?: string;
  warehouseId?: string;
  sku?: string;
}): Array<Record<string, unknown>> {
  let rows = wms.list<Record<string, unknown>>('replenishment_suggestions');
  if (filters?.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.sku) {
    rows = rows.filter((r) => r.sku === filters.sku);
  }
  rows = rows.sort((a, b) => ((a.created_at as string) > (b.created_at as string) ? -1 : 1));
  return rows;
}

/** 更新补货建议 */
export function updateReplenishmentSuggestion(id: number, updates: Record<string, unknown>): boolean {
  const existing = wms.get<Record<string, unknown>>('replenishment_suggestions', id);
  if (!existing) return false;
  const now = new Date().toISOString();

  const merged: Record<string, unknown> = { ...existing };
  if (updates.status !== undefined) merged.status = updates.status;
  if (updates.suggestedQty !== undefined) merged.suggested_qty = updates.suggestedQty;
  if (updates.reason !== undefined) merged.reason = updates.reason;
  merged.updated_at = now;

  wms.update<Record<string, unknown>>('replenishment_suggestions', id, merged);
  return true;
}

// ===================== 补货建议 DAO（原有） =====================

/** 根据 ID 查询补货建议（精简字段，用于路由层校验） */
export function getReplenishmentSuggestionById(id: number): { sku: string; warehouseId: string; suggestedQty: number; status: string } | undefined {
  const row = wms.get<Record<string, unknown>>('replenishment_suggestions', id);
  if (!row) return undefined;
  return {
    sku: row.sku as string,
    warehouseId: row.warehouse_id as string,
    suggestedQty: row.suggested_qty as number,
    status: row.status as string,
  };
}

// ===================== 预测看板 DAO =====================

export interface PredictionDashboardData {
  predictedShortageCount: number;
  predictedOverstockCount: number;
  pendingReplenishSkuCount: number;
  dataCoverageRate: number;
}

/** 获取预测看板汇总数据 */
export function getPredictionDashboard(minHistoryDays: number): PredictionDashboardData {
  const alerts = wms.list<WmsAlertRow>('wms_alerts');

  const shortageCount = alerts.filter((a) => a.alert_type === 'predicted_shortage' && a.status === 'active').length;
  const overstockCount = alerts.filter((a) => a.alert_type === 'predicted_overstock' && a.status === 'active').length;
  const pendingReplenish = new Set(
    alerts.filter((a) => a.alert_type === 'predicted_shortage' && a.status === 'active' && a.sku != null).map((a) => a.sku!)
  ).size;

  const totalSkus = wms.list<Record<string, unknown>>('inventory_items').filter((i) => (i.quantity as number) > 0).length;

  const transactions = wms.list<Record<string, unknown>>('inventory_transactions');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const outboundTx = transactions.filter(
    (t) => (t.type === 'outbound' || t.type === 'transfer_out') && (t.createdAt as string) >= thirtyDaysAgo
  );

  const skuWarehouseDays = new Map<string, Set<string>>();
  for (const t of outboundTx) {
    const key = `${t.sku}|${t.warehouseId}`;
    const date = String(t.createdAt).slice(0, 10);
    if (!skuWarehouseDays.has(key)) skuWarehouseDays.set(key, new Set());
    skuWarehouseDays.get(key)!.add(date);
  }
  let skusWithEnoughHistory = 0;
  for (const days of skuWarehouseDays.values()) {
    if (days.size >= minHistoryDays) skusWithEnoughHistory++;
  }

  const coverageRate = totalSkus > 0 ? Math.round((skusWithEnoughHistory / totalSkus) * 100) : 0;

  return {
    predictedShortageCount: shortageCount,
    predictedOverstockCount: overstockCount,
    pendingReplenishSkuCount: pendingReplenish,
    dataCoverageRate: coverageRate,
  };
}

// ===================== 报表（Report）DAO =====================

/** 创建报表记录，返回自增 ID */
export function createReport(report: Omit<WmsReport, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString();
  const id = wms.nextId('wms_reports');
  const row: WmsReportRow = {
    id,
    report_type: report.reportType,
    warehouse_id: report.warehouseId ?? null,
    start_date: report.startDate ?? null,
    end_date: report.endDate ?? null,
    file_path: report.filePath ?? null,
    file_format: report.fileFormat,
    generated_by: report.generatedBy ?? null,
    generated_at: report.generatedAt ?? now,
    status: report.status,
    created_at: now,
    updated_at: now,
  };
  wms.create<WmsReportRow>('wms_reports', id, row);
  return id;
}

/** 查询报表记录，支持 reportType / warehouseId / status 过滤 */
export function getReports(filters?: {
  reportType?: string;
  warehouseId?: string;
  status?: string;
}): WmsReport[] {
  let rows = wms.list<WmsReportRow>('wms_reports');
  if (filters?.reportType) {
    rows = rows.filter((r) => r.report_type === filters.reportType);
  }
  if (filters?.warehouseId) {
    rows = rows.filter((r) => r.warehouse_id === filters.warehouseId);
  }
  if (filters?.status) {
    rows = rows.filter((r) => r.status === filters.status);
  }
  rows = rows.sort((a, b) => ((a.generated_at ?? '') > (b.generated_at ?? '') ? -1 : 1));
  return rows.map(reportRowToModel);
}

/** 根据 ID 查询单条报表记录 */
export function getReportById(id: number): WmsReport | undefined {
  const row = wms.get<WmsReportRow>('wms_reports', id);
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
  const reportsDir = AppPaths.reportsDir;
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 查询库存数据
  let items = wms.list<Record<string, unknown>>('inventory_items');
  if (params?.warehouseId) {
    items = items.filter((i) => i.warehouseId === params.warehouseId);
  }
  if (params?.startDate) {
    items = items.filter((i) => (i.inboundDate as string) >= params.startDate!);
  }
  if (params?.endDate) {
    items = items.filter((i) => (i.inboundDate as string) <= params.endDate!);
  }

  // 生成 CSV 内容
  const headers = ['sku', 'name', 'warehouseId', 'quantity', 'volumePerUnit', 'totalVolume', 'inboundDate', 'valuePerUnit', 'totalValue', 'category'];
  const csvLines: string[] = [headers.join(',')];
  for (const item of items) {
    const row = headers.map((h) => {
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

/** 删除报表记录 */
export function deleteReport(id: number): boolean {
  return wms.delete('wms_reports', id);
}
