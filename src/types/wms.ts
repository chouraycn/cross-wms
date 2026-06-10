/**
 * CDF Know Clow 仓储管理扩展模块 — 类型定义
 *
 * 包含：入库质检、库存盘点、出库复核、异常预警、报表生成
 * 从后端 DAO 模型映射（camelCase）
 */

// ===================== 入库质检 =====================

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

// ===================== 库存盘点 =====================

export interface InventoryCount {
  id?: number;
  warehouseId: string;
  locationCode: string;
  sku: string;
  systemQuantity: number;
  actualQuantity?: number;
  variance?: number;       // 后端 GENERATED ALWAYS AS 列自动计算
  counter?: string;
  countTime?: string;
  status: 'pending' | 'counted' | 'adjusted';  // ⚠️ 必须是这三个，不是 'confirmed'
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 库存盘点筛选参数 */
export interface InventoryCountFilter {
  warehouseId?: string;
  status?: 'pending' | 'counted' | 'adjusted';
  sku?: string;
  locationCode?: string;
}

/** 库存盘点统计信息 */
export interface InventoryStats {
  total: number;
  pending: number;
  counted: number;
  adjusted: number;
  totalVariance: number;  // 总差异数量
}

/** 批量创建盘点单的行数据 */
export interface BatchCreateRow {
  warehouseId: string;
  locationCode: string;
  sku: string;
  systemQuantity: number;
}

// ===================== 出库复核 =====================

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

// ===================== 异常预警 =====================

export type AlertType = 'low_stock' | 'expiry' | 'stagnant' | 'predicted_shortage' | 'predicted_overstock';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'resolved' | 'ignored';

export interface WmsAlert {
  id?: number;
  warehouseId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  sku?: string;
  message: string;
  triggeredAt?: string;
  resolvedAt?: string;
  status: AlertStatus;
  createdAt?: string;
  updatedAt?: string;
}

// ===================== 报表生成 =====================

export type ReportType = 'inbound' | 'outbound' | 'inventory' | 'custom';
export type FileFormat = 'csv' | 'xlsx' | 'pdf';
export type ReportStatus = 'pending' | 'completed' | 'failed';

export interface WmsReport {
  id?: number;
  reportType: ReportType;
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
  filePath?: string;
  fileFormat: FileFormat;
  generatedBy?: string;
  generatedAt?: string;
  status: ReportStatus;
  createdAt?: string;
  updatedAt?: string;
}

// ===================== 智能预测 =====================

/** 预测看板汇总数据 */
export interface PredictionDashboardData {
  predictedShortageCount: number;
  predictedOverstockCount: number;
  pendingReplenishSkuCount: number;
  dataCoverageRate: number; // 0-100
}

/** 预测详情（与后端 PredictionDetail 对齐） */
export interface PredictionDetail {
  sku: string;
  warehouseId: string;
  warehouseName?: string;
  currentStock: number;
  dailyConsumption: number;
  daysUntilZero: number;
  confidence: 'high' | 'medium' | 'low';
  historyData: Array<{ date: string; stock: number; outbound: number }>;
  predictionCurve: Array<{ date: string; predictedStock: number }>;
  safetyStockLine: number;
}

/** 预测配置（前端 AlertRuleConfig 扩展） */
export interface PredictionConfig {
  enabled: boolean;
  predictionDays: number;
  shortageThreshold: number;
  overstockDays: number;
  minHistoryDays: number;
}

// ===================== 仓库调拨 =====================

export type TransferStatus = 'draft' | 'submitted' | 'in_transit' | 'completed';

export interface TransferOrder {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  status: TransferStatus;
  transitOrderId: string | null;
  createdBy: string;
  submittedAt: string | null;
  submittedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  remark: string;
  createdAt: string;
  updatedAt: string;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  transitTrackingNo?: string;
}

/** 调拨单筛选参数 */
export interface TransferOrderFilter {
  status?: TransferStatus;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  sku?: string;
}

/** 调拨单统计信息 */
export interface TransferStats {
  total: number;
  draft: number;
  submitted: number;
  in_transit: number;
  completed: number;
}

// ===================== 智能补货建议 (v1.6.0) =====================

export type ReplenishmentPriority = 'critical' | 'high' | 'medium' | 'low';
export type ReplenishmentStatus = 'pending' | 'confirmed' | 'ignored' | 'deferred';

/** 补货建议 */
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

/** 补货配置 */
export interface ReplenishmentConfig {
  coverDays: number;
  enableAutoGenerate: boolean;
  minHistoryDays: number;
}

/** 补货筛选参数 */
export interface ReplenishmentFilter {
  warehouseId?: string;
  sku?: string;
  priority?: ReplenishmentPriority;
  status?: ReplenishmentStatus;
  page?: number;
  pageSize?: number;
}

/** 补货统计信息 */
export interface ReplenishmentStats {
  total: number;
  pending: number;
  critical: number;
  totalInTransitQty: number;
  todayConfirmed: number;
}

/** 推荐来源仓库 */
export interface SourceRecommendation {
  warehouseId: string;
  warehouseName: string;
  surplus: number;
  score: number;
}
