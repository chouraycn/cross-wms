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
  actualQuantity: number;
  variance?: number;
  counter?: string;
  countTime?: string;
  status: 'pending' | 'confirmed' | 'adjusted';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
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

export type AlertType = 'low_stock' | 'expiry' | 'stagnant';
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
