// ===================== Warehouse Types =====================

export type WarehouseStatus = 'normal' | 'warning' | 'full';

export interface Warehouse {
  id: string;
  name: string;
  country: string;
  city: string;
  totalVolume: number; // m³
  usedVolume: number;  // m³
  totalItems: number;  // 件数上限
  usedItems: number;   // 已用件数
  status: WarehouseStatus;
  address: string;
  manager: string;
  phone: string;
  createdAt: string;
}

// ===================== In-Transit Types =====================

export type TransitStatus = 'dispatched' | 'in_transit' | 'customs' | 'arrived';
export type TransportMode = 'sea' | 'air' | 'land';

export interface TransitOrder {
  id: string;
  trackingNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  category: string;
  weight: number;   // kg
  volume: number;   // m³
  transportMode: TransportMode;
  estimatedArrival: string;
  actualArrival?: string;
  status: TransitStatus;
  createdAt: string;
  statusHistory: StatusHistoryItem[];
  carrier: string;
  value: number; // USD
}

export interface StatusHistoryItem {
  status: TransitStatus;
  time: string;
  location: string;
  remark: string;
}

// ===================== Inventory Types =====================

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  volumePerUnit: number; // m³/件
  totalVolume: number;   // m³
  inboundDate: string;
  valuePerUnit: number;  // USD
  totalValue: number;    // USD
  category: string;
  isAgeWarning: boolean; // 超过90天
}

// ===================== Report Types =====================

export interface MonthlyTrend {
  month: string;
  inbound: number;
  outbound: number;
}

export interface WarehouseVolumeData {
  warehouseName: string;
  usedVolume: number;
  freeVolume: number;
}

export interface CategoryVolumeData {
  category: string;
  volume: number;
}

export interface TransitEfficiencyData {
  month: string;
  avgDays: number;
  onTimeRate: number;
}

// ===================== Dashboard Types =====================

export interface KpiData {
  totalTransitVolume: number;
  totalVolumeUtilization: number;
  pendingInboundOrders: number;
  todayOutboundCount: number;
  inventoryDepth: number; // 库存深度（天）= 当前库存总量 / 日均出库量
}

export interface VolumeHistoryPoint {
  date: string;
  utilizationRate: number;
}

// ===================== Inbound / Outbound Records =====================

export interface InboundRecord {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  createdAt: string;
  operator: string;
  status: 'pending' | 'completed';
}

export interface OutboundRecord {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  createdAt: string;
  operator: string;
  destination: string;
}

// ===== Widget 数据导出类型 =====

export interface WidgetWarehouseSummary {
  id: string;
  name: string;
  city: string;
  usedItems: number;
  totalItems: number;
  utilizationRate: number;
  status: string;
  inboundToday: number;
  outboundToday: number;
}

export interface WidgetKpiHistoryPoint {
  date: string;
  utilizationRate: number;
}

export interface WidgetAppSettings {
  warningThreshold: number;
  fullThreshold: number;
  refreshInterval: number;
}

export interface WidgetPayload {
  version: number;
  lastUpdated: string;
  timestamp: number;
  totalWarehouses: number;
  totalUsedItems: number;
  totalCapacity: number;
  warningCount: number;
  inboundCount: number;
  outboundCount: number;
  transitCount: number;
  inventoryDepth: number;
  warehouses: WidgetWarehouseSummary[];
  history: WidgetKpiHistoryPoint[];
  settings: WidgetAppSettings;
}

export interface TransitStatusDistribution {
  name: string;
  value: number;
  color: string;
}
