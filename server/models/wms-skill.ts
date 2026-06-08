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
  alertType: 'low_stock' | 'expiry' | 'stagnant';
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
