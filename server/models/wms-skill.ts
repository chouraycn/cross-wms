/**
 * WMS Skill Data Models
 *
 * 定义入库质检、库存盘点、出库复核、异常预警、报表生成的 TypeScript 接口。
 * 字段命名使用 camelCase（前端/应用层），数据库使用 snake_case，由 DAO 层做转换。
 */

/** 入库质检记录 */
export interface QualityCheck {
  id?: number;
  warehouseId: string;
  sku: string;
  productName?: string;
  batchNo?: string;
  expiryDate?: string;
  expectedQuantity: number;
  actualQuantity: number;
  qualityStatus: 'pending' | 'qualified' | 'unqualified';
  inspector?: string;
  checkTime?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 库存盘点记录 */
export interface InventoryCount {
  id?: number;
  warehouseId: string;
  locationCode: string;
  sku: string;
  systemQuantity: number;
  actualQuantity: number;
  /** 差异量 = actual - system（数据库自动计算） */
  variance?: number;
  counter?: string;
  countTime?: string;
  status: 'pending' | 'confirmed' | 'adjusted';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 出库复核记录 */
export interface OutboundReview {
  id?: number;
  outboundOrderId: string;
  warehouseId: string;
  sku: string;
  productName?: string;
  expectedQuantity: number;
  scannedQuantity: number;
  reviewStatus: 'pending' | 'passed' | 'failed';
  reviewer?: string;
  reviewTime?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 异常预警 */
export interface WmsAlert {
  id?: number;
  warehouseId: string;
  alertType: 'low_stock' | 'expiry' | 'stagnant' | 'predicted_shortage' | 'predicted_overstock';
  severity: 'low' | 'medium' | 'high' | 'critical';
  sku?: string;
  message: string;
  triggeredAt?: string;
  resolvedAt?: string;
  status: 'active' | 'resolved' | 'ignored';
  createdAt?: string;
  updatedAt?: string;
}

/** 报表生成记录 */
export interface WmsReport {
  id?: number;
  reportType: 'inbound' | 'outbound' | 'inventory' | 'custom';
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
  filePath?: string;
  fileFormat: 'csv' | 'xlsx' | 'pdf';
  generatedBy?: string;
  generatedAt?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt?: string;
  updatedAt?: string;
}

// ===================== 预警阈值与检查结果类型 =====================

/** 预警阈值配置 */
export interface AlertThresholds {
  lowStock?: number;     // 低库存阈值，默认 10
  expiryDays?: number;   // 临期天数，默认 30
  stagnantDays?: number; // 呆滞天数（无出库记录），默认 90
  // 智能预测参数
  enablePrediction?: boolean;
  predictionDays?: number;     // 默认 14
  shortageThreshold?: number;  // 默认 10
  overstockDays?: number;      // 默认 60
  minHistoryDays?: number;     // 默认 7
}

/** 预警检查结果 */
export interface AlertCheckResult {
  newAlerts: number;          // 新创建的预警数量
  lowStockAlerts: number;     // 低库存预警数
  expiryAlerts: number;       // 临期预警数
  stagnantAlerts: number;     // 呆滞预警数
  // 智能预测结果
  predictedShortageAlerts: number;   // 预测短缺预警数
  predictedOverstockAlerts: number;  // 预测积压预警数
  errors: string[];           // 错误列表
}

// ===================== DB Row 类型（snake_case）=====================

/** 数据库行：wms_quality_checks */
export interface QualityCheckRow {
  id: number;
  warehouse_id: string;
  sku: string;
  product_name: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  expected_quantity: number;
  actual_quantity: number;
  quality_status: string;
  inspector: string | null;
  check_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** 数据库行：wms_inventory_counts */
export interface InventoryCountRow {
  id: number;
  warehouse_id: string;
  location_code: string;
  sku: string;
  system_quantity: number;
  actual_quantity: number;
  variance: number;
  counter: string | null;
  count_time: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** 数据库行：wms_outbound_reviews */
export interface OutboundReviewRow {
  id: number;
  outbound_order_id: string;
  warehouse_id: string;
  sku: string;
  product_name: string | null;
  expected_quantity: number;
  scanned_quantity: number;
  review_status: string;
  reviewer: string | null;
  review_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** 数据库行：wms_alerts */
export interface WmsAlertRow {
  id: number;
  warehouse_id: string;
  alert_type: string;
  severity: string;
  sku: string | null;
  message: string;
  triggered_at: string | null;
  resolved_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** 数据库行：wms_reports */
export interface WmsReportRow {
  id: number;
  report_type: string;
  warehouse_id: string | null;
  start_date: string | null;
  end_date: string | null;
  file_path: string | null;
  file_format: string;
  generated_by: string | null;
  generated_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ===================== 智能预测类型 =====================

/** 每日出库聚合数据（从 inventory_transactions 查询） */
export interface DailyOutbound {
  sku: string;
  warehouseId: string;
  date: string;          // ISO date string (YYYY-MM-DD)
  dailyOutbound: number; // 当日出库量合计
}

/** SKU 预测结果 */
export interface SkuPrediction {
  sku: string;
  warehouseId: string;
  warehouseName?: string;
  currentStock: number;          // 当前库存
  dailyConsumption: number;      // EMA 日均消耗速率
  predictedStock: number;        // 预测库存 = currentStock - dailyConsumption × predictionDays
  daysUntilZero: number;         // 预测归零天数（若 >= predictionDays 则无风险）
  historyDays: number;           // 实际有出库记录的天数
  confidence: 'high' | 'medium' | 'low'; // 置信度（基于数据量）
}

/** 预测详情（API 返回给前端图表） */
export interface PredictionDetail {
  sku: string;
  warehouseId: string;
  warehouseName?: string;
  currentStock: number;
  dailyConsumption: number;
  daysUntilZero: number;
  confidence: 'high' | 'medium' | 'low';
  historyData: Array<{ date: string; stock: number; outbound: number }>; // 过去 30 天
  predictionCurve: Array<{ date: string; predictedStock: number }>;      // 未来 N 天
  safetyStockLine: number; // 安全库存线（= shortageThreshold）
}

/** 预测配置（与 AlertRuleConfig 预测部分对齐） */
export interface PredictionConfig {
  enabled: boolean;
  predictionDays: number;     // 默认 14
  shortageThreshold: number;  // 默认 10
  overstockDays: number;      // 默认 60
  minHistoryDays: number;     // 默认 7
}

export const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  enabled: true,
  predictionDays: 14,
  shortageThreshold: 10,
  overstockDays: 60,
  minHistoryDays: 7,
};

// ===================== 转换工具函数 =====================

/** snake_case DB Row → camelCase 应用模型 */
export function qualityCheckRowToModel(row: QualityCheckRow): QualityCheck {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    sku: row.sku,
    productName: row.product_name ?? undefined,
    batchNo: row.batch_no ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    expectedQuantity: row.expected_quantity,
    actualQuantity: row.actual_quantity,
    qualityStatus: row.quality_status as QualityCheck['qualityStatus'],
    inspector: row.inspector ?? undefined,
    checkTime: row.check_time ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** snake_case DB Row → camelCase 应用模型 */
export function inventoryCountRowToModel(row: InventoryCountRow): InventoryCount {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    locationCode: row.location_code,
    sku: row.sku,
    systemQuantity: row.system_quantity,
    actualQuantity: row.actual_quantity,
    variance: row.variance,
    counter: row.counter ?? undefined,
    countTime: row.count_time ?? undefined,
    status: row.status as InventoryCount['status'],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** snake_case DB Row → camelCase 应用模型 */
export function outboundReviewRowToModel(row: OutboundReviewRow): OutboundReview {
  return {
    id: row.id,
    outboundOrderId: row.outbound_order_id,
    warehouseId: row.warehouse_id,
    sku: row.sku,
    productName: row.product_name ?? undefined,
    expectedQuantity: row.expected_quantity,
    scannedQuantity: row.scanned_quantity,
    reviewStatus: row.review_status as OutboundReview['reviewStatus'],
    reviewer: row.reviewer ?? undefined,
    reviewTime: row.review_time ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** snake_case DB Row → camelCase 应用模型 */
export function alertRowToModel(row: WmsAlertRow): WmsAlert {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    alertType: row.alert_type as WmsAlert['alertType'],
    severity: row.severity as WmsAlert['severity'],
    sku: row.sku ?? undefined,
    message: row.message,
    triggeredAt: row.triggered_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    status: row.status as WmsAlert['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** snake_case DB Row → camelCase 应用模型 */
export function reportRowToModel(row: WmsReportRow): WmsReport {
  return {
    id: row.id,
    reportType: row.report_type as WmsReport['reportType'],
    warehouseId: row.warehouse_id ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    filePath: row.file_path ?? undefined,
    fileFormat: row.file_format as WmsReport['fileFormat'],
    generatedBy: row.generated_by ?? undefined,
    generatedAt: row.generated_at ?? undefined,
    status: row.status as WmsReport['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===================== Replenishment Suggestion Types (v1.6.0) =====================

export type ReplenishmentPriority = 'critical' | 'high' | 'medium' | 'low';
export type ReplenishmentStatus = 'pending' | 'confirmed' | 'ignored' | 'deferred';

/** Replenishment suggestion (application model, camelCase) */
export interface ReplenishmentSuggestion {
  id?: number;
  sku: string;
  warehouseId: string;
  currentStock: number;
  inTransitQty: number;
  safetyStock: number;
  dailyConsumption: number;
  targetStock: number;
  suggestedQty: number;
  sourceWarehouseId?: string;
  priority: ReplenishmentPriority;
  status: ReplenishmentStatus;
  transferOrderId?: string;
  createdAt?: string;
  updatedAt?: string;
  warehouseName?: string;
  sourceWarehouseName?: string;
  skuName?: string;
  daysUntilZero?: number;
}

/** Replenishment configuration */
export interface ReplenishmentConfig {
  coverDays: number;
  enableAutoGenerate: boolean;
  minHistoryDays: number;
}

export const DEFAULT_REPLENISHMENT_CONFIG: ReplenishmentConfig = {
  coverDays: 14,
  enableAutoGenerate: false,
  minHistoryDays: 7,
};

/** Database row: replenishment_suggestions (snake_case) */
export interface ReplenishmentSuggestionRow {
  id: number;
  sku: string;
  warehouse_id: string;
  current_stock: number;
  in_transit_qty: number;
  safety_stock: number;
  daily_consumption: number;
  target_stock: number;
  suggested_qty: number;
  source_warehouse_id: string | null;
  priority: string;
  status: string;
  transfer_order_id: string | null;
  created_at: string;
  updated_at: string;
}

/** snake_case DB Row → camelCase application model */
export function replenishmentRowToModel(row: ReplenishmentSuggestionRow): ReplenishmentSuggestion {
  return {
    id: row.id,
    sku: row.sku,
    warehouseId: row.warehouse_id,
    currentStock: row.current_stock,
    inTransitQty: row.in_transit_qty,
    safetyStock: row.safety_stock,
    dailyConsumption: row.daily_consumption,
    targetStock: row.target_stock,
    suggestedQty: row.suggested_qty,
    sourceWarehouseId: row.source_warehouse_id ?? undefined,
    priority: row.priority as ReplenishmentPriority,
    status: row.status as ReplenishmentStatus,
    transferOrderId: row.transfer_order_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Source warehouse recommendation */
export interface SourceRecommendation {
  warehouseId: string;
  warehouseName: string;
  surplus: number;
  score: number;
}
