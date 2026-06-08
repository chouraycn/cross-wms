/**
 * CDF Know Clow MSW Mock 数据工厂
 * 基于 src/types/index.ts 类型定义生成 mock 数据
 */

import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  InboundRecord,
  OutboundRecord,
  MonthlyTrend,
  WarehouseVolumeData,
  CategoryVolumeData,
  TransitEfficiencyData,
  KpiData,
  VolumeHistoryPoint,
} from '../types';

// ===================== 基础数据生成工具 =====================

let warehouseIdCounter = 1;
let transitIdCounter = 1001;
let inventoryIdCounter = 5001;
let inboundIdCounter = 6001;
let outboundIdCounter = 7001;

export function resetCounters() {
  warehouseIdCounter = 1;
  transitIdCounter = 1001;
  inventoryIdCounter = 5001;
  inboundIdCounter = 6001;
  outboundIdCounter = 7001;
}

// ===================== Warehouse Mock 数据 =====================

const CITIES = [
  { country: '中国', city: '深圳' },
  { country: '美国', city: '洛杉矶' },
  { country: '德国', city: '法兰克福' },
  { country: '日本', city: '大阪' },
  { country: '英国', city: '伦敦' },
];

export function createMockWarehouse(overrides?: Partial<Warehouse>): Warehouse {
  const location = CITIES[(warehouseIdCounter - 1) % CITIES.length];
  const totalItems = overrides?.totalItems ?? Math.floor(Math.random() * 50000) + 10000;
  const usedItems = overrides?.usedItems ?? Math.floor(Math.random() * totalItems * 0.8);
  const totalVolume = (overrides?.totalVolume ?? Math.floor(Math.random() * 50000) + 10000);
  const usedVolume = overrides?.usedVolume ?? Math.floor(totalVolume * (usedItems / totalItems));

  const wh: Warehouse = {
    id: overrides?.id ?? `wh-${warehouseIdCounter++}`,
    name: overrides?.name ?? `${location.city}海外仓`,
    country: overrides?.country ?? location.country,
    city: overrides?.city ?? location.city,
    totalVolume,
    usedVolume,
    totalItems,
    usedItems,
    status: overrides?.status ?? ('normal' as Warehouse['status']),
    address: overrides?.address ?? `${location.city}市XX区XX路123号`,
    manager: overrides?.manager ?? '张三',
    phone: overrides?.phone ?? '13800138000',
    createdAt: overrides?.createdAt ?? '2025-01-15',
  };
  return wh;
}

export function createMockWarehouses(count: number): Warehouse[] {
  return Array.from({ length: count }, (_, _i) => createMockWarehouse());
}

// ===================== TransitOrder Mock 数据 =====================

const STATUSES: TransitOrder['status'][] = ['dispatched', 'in_transit', 'customs', 'arrived'];
const MODES: TransitOrder['transportMode'][] = ['sea', 'air', 'land'];
const CATEGORIES = ['电子产品', '服装', '家居用品', '机械设备', '食品'];

export function createMockTransitOrder(overrides?: Partial<TransitOrder>): TransitOrder {
  const fromWh = CITIES[Math.floor(Math.random() * CITIES.length)];
  let toWh = CITIES[Math.floor(Math.random() * CITIES.length)];
  while (toWh.city === fromWh.city) {
    toWh = CITIES[Math.floor(Math.random() * CITIES.length)];
  }

  const status = overrides?.status ?? STATUSES[Math.floor(Math.random() * STATUSES.length)];
  const now = new Date();
  const estArrival = new Date(now.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000);

  const order: TransitOrder = {
    id: overrides?.id ?? `TO-${transitIdCounter++}`,
    trackingNo: overrides?.trackingNo ?? `TRK${String(transitIdCounter).padStart(6, '0')}`,
    fromWarehouseId: overrides?.fromWarehouseId ?? `wh-${Math.floor(Math.random() * 5) + 1}`,
    toWarehouseId: overrides?.toWarehouseId ?? `wh-${Math.floor(Math.random() * 5) + 1}`,
    category: overrides?.category ?? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    weight: overrides?.weight ?? Math.floor(Math.random() * 5000) + 100,
    volume: overrides?.volume ?? Math.floor(Math.random() * 100) + 5,
    transportMode: overrides?.transportMode ?? MODES[Math.floor(Math.random() * MODES.length)],
    estimatedArrival: overrides?.estimatedArrival ?? estArrival.toISOString().split('T')[0],
    actualArrival: status === 'arrived' ? new Date().toISOString().split('T')[0] : undefined,
    status,
    createdAt: overrides?.createdAt ?? new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    statusHistory: overrides?.statusHistory ?? [
      { status: 'dispatched', time: '2025-03-01 08:00', location: fromWh.city, remark: '已发货' },
      { status: 'in_transit', time: '2025-03-05 14:30', location: '途中', remark: '运输中' },
    ],
    carrier: overrides?.carrier ?? '顺丰国际',
    value: overrides?.value ?? Math.floor(Math.random() * 50000) + 1000,
  };
  return order;
}

export function createMockTransitOrders(count: number): TransitOrder[] {
  return Array.from({ length: count }, () => createMockTransitOrder());
}

// ===================== InventoryItem Mock 数据 =====================

export function createMockInventoryItem(overrides?: Partial<InventoryItem>): InventoryItem {
  const warehouseId = overrides?.warehouseId ?? `wh-${Math.floor(Math.random() * 5) + 1}`;
  const quantity = overrides?.quantity ?? Math.floor(Math.random() * 5000) + 10;
  const volumePerUnit = overrides?.volumePerUnit ?? Math.random() * 0.1 + 0.01;
  const valuePerUnit = overrides?.valuePerUnit ?? Math.random() * 100 + 5;
  const inboundDate = new Date(Date.now() - Math.random() * 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const daysInStock = Math.floor((Date.now() - new Date(inboundDate).getTime()) / (24 * 60 * 60 * 1000));

  const item: InventoryItem = {
    id: overrides?.id ?? `INV-${inventoryIdCounter++}`,
    sku: overrides?.sku ?? `SKU${String(inventoryIdCounter).padStart(6, '0')}`,
    name: overrides?.name ?? `商品${inventoryIdCounter}`,
    warehouseId,
    quantity,
    volumePerUnit,
    totalVolume: quantity * volumePerUnit,
    inboundDate,
    valuePerUnit,
    totalValue: quantity * valuePerUnit,
    category: overrides?.category ?? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    isAgeWarning: overrides?.isAgeWarning ?? (daysInStock > 90),
  };
  return item;
}

export function createMockInventoryItems(count: number): InventoryItem[] {
  return Array.from({ length: count }, () => createMockInventoryItem());
}

// ===================== InboundRecord Mock 数据 =====================

export function createMockInboundRecord(overrides?: Partial<InboundRecord>): InboundRecord {
  const record: InboundRecord = {
    id: overrides?.id ?? `INB-${inboundIdCounter++}`,
    warehouseId: overrides?.warehouseId ?? `wh-${Math.floor(Math.random() * 5) + 1}`,
    sku: overrides?.sku ?? `SKU${String(inboundIdCounter).padStart(6, '0')}`,
    name: overrides?.name ?? `商品${inboundIdCounter}`,
    quantity: overrides?.quantity ?? Math.floor(Math.random() * 500) + 10,
    volume: overrides?.volume ?? Math.floor(Math.random() * 50) + 1,
    createdAt: overrides?.createdAt ?? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    operator: overrides?.operator ?? '管理员',
    status: overrides?.status ?? (Math.random() > 0.3 ? 'completed' : 'pending'),
  };
  return record;
}

export function createMockInboundRecords(count: number): InboundRecord[] {
  return Array.from({ length: count }, () => createMockInboundRecord());
}

// ===================== OutboundRecord Mock 数据 =====================

export function createMockOutboundRecord(overrides?: Partial<OutboundRecord>): OutboundRecord {
  const record: OutboundRecord = {
    id: overrides?.id ?? `OUT-${outboundIdCounter++}`,
    warehouseId: overrides?.warehouseId ?? `wh-${Math.floor(Math.random() * 5) + 1}`,
    sku: overrides?.sku ?? `SKU${String(outboundIdCounter).padStart(6, '0')}`,
    name: overrides?.name ?? `商品${outboundIdCounter}`,
    quantity: overrides?.quantity ?? Math.floor(Math.random() * 300) + 5,
    volume: overrides?.volume ?? Math.floor(Math.random() * 30) + 1,
    createdAt: overrides?.createdAt ?? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    operator: overrides?.operator ?? '管理员',
    destination: overrides?.destination ?? CITIES[Math.floor(Math.random() * CITIES.length)].city,
  };
  return record;
}

export function createMockOutboundRecords(count: number): OutboundRecord[] {
  return Array.from({ length: count }, () => createMockOutboundRecord());
}

// ===================== Dashboard Mock 数据 =====================

export function createMockKpiData(): KpiData {
  return {
    totalTransitVolume: Math.floor(Math.random() * 5000) + 1000,
    totalVolumeUtilization: Math.random() * 0.4 + 0.5,
    pendingInboundOrders: Math.floor(Math.random() * 50) + 10,
    todayOutboundCount: Math.floor(Math.random() * 200) + 50,
    inventoryDepth: Math.floor(Math.random() * 30) + 45,
  };
}

export function createMockVolumeHistory(days: number = 30): VolumeHistoryPoint[] {
  const points: VolumeHistoryPoint[] = [];
  const baseDate = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000);
    points.push({
      date: date.toISOString().split('T')[0],
      utilizationRate: 0.5 + Math.random() * 0.3,
    });
  }
  return points;
}

export function createMockMonthlyTrend(): MonthlyTrend[] {
  const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  return months.map(month => ({
    month,
    inbound: Math.floor(Math.random() * 5000) + 1000,
    outbound: Math.floor(Math.random() * 4500) + 800,
  }));
}

export function createMockWarehouseVolumeData(warehouses: Warehouse[]): WarehouseVolumeData[] {
  return warehouses.map(wh => ({
    warehouseName: wh.name,
    usedVolume: wh.usedVolume,
    freeVolume: wh.totalVolume - wh.usedVolume,
  }));
}

export function createMockCategoryVolumeData(): CategoryVolumeData[] {
  return CATEGORIES.map(cat => ({
    category: cat,
    volume: Math.floor(Math.random() * 10000) + 1000,
  }));
}

export function createMockTransitEfficiencyData(): TransitEfficiencyData[] {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  return months.map(month => ({
    month,
    avgDays: Math.floor(Math.random() * 10) + 5,
    onTimeRate: 0.8 + Math.random() * 0.2,
  }));
}
