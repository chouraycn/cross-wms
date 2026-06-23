/**
 * Inventory Service
 *
 * 库存核心服务，负责库存的增删改查、出入库操作、库存校验。
 * 核心流程：入库 → 更新库存 → 记录入库历史 / 出库 → 校验库存 → 扣减 → 记录出库历史
 *
 * v10.0: 改为使用 DAO 层（warehouse.ts）操作库存数据
 */

import type { InventoryItem, InboundRecord, OutboundRecord } from '../types/inventory.js';
import { logger } from '../logger.js';
import {
  getInventoryItems,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  createInboundRecord,
  createOutboundRecord,
} from '../dao/warehouse.js';

// ===================== 常量定义 =====================

/** 默认入库操作人 */
const DEFAULT_OPERATOR = 'system';

// ===================== 工具函数 =====================

/**
 * 获取当前时间戳（ISO 格式）
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * 将 DAO 返回的 Record 转换为 InventoryItem（处理字段映射）
 */
function toInventoryItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: Number(row.id),
    sku: row.sku as string,
    name: row.name as string,
    warehouseId: row.warehouseId as string,
    quantity: row.quantity as number,
    unitPrice: (row.valuePerUnit as number) ?? 0,
    totalValue: row.totalValue as number,
    totalVolume: (row.totalVolume as number | null) ?? null,
    location: null,
    expiryDate: null,
    createdAt: (row.inboundDate as string) ?? '',
    updatedAt: (row.inboundDate as string) ?? '',
  };
}

// ===================== 核心函数 =====================

/**
 * 创建库存项
 *
 * 如果同一仓库已存在相同 SKU，则增加数量（合并库存）
 *
 * @param item 库存项数据
 * @returns 创建的库存项 ID
 */
export function createInventory(item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): number {
  // 检查是否已存在
  const allItems = getInventoryItems(item.warehouseId) as Array<Record<string, unknown>>;
  const existing = allItems.find((i) => i.sku === item.sku) as
    | { id: string; quantity: number; valuePerUnit: number }
    | undefined;

  if (existing) {
    // 合并库存
    const newQuantity = existing.quantity + item.quantity;
    const newTotalValue = item.unitPrice * newQuantity;

    updateInventoryItem(existing.id, {
      quantity: newQuantity,
      totalValue: newTotalValue,
      inboundDate: now(),
    });

    return Number(existing.id);
  }

  // 创建新库存项
  const record = createInventoryItem({
    sku: item.sku,
    name: item.name,
    warehouseId: item.warehouseId,
    quantity: item.quantity,
    valuePerUnit: item.unitPrice,
    totalValue: item.unitPrice * item.quantity,
    totalVolume: item.totalVolume ?? 0,
    inboundDate: now(),
    volumePerUnit: 0,
    category: '',
    autoCreated: 0,
  });

  return Number(record.id);
}

/**
 * 更新库存项
 *
 * @param itemId 库存项 ID
 * @param updates 更新数据
 * @returns 是否更新成功
 */
export function updateInventory(
  itemId: number,
  updates: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>
): boolean {
  const existing = getInventoryItemById(String(itemId)) as Record<string, unknown> | undefined;
  if (!existing) return false;

  // 如果更新数量，同步更新总价值
  let totalValue = existing.totalValue as number;
  if (updates.quantity !== undefined) {
    const unitPrice = updates.unitPrice ?? (existing.valuePerUnit as number) ?? 0;
    totalValue = unitPrice * updates.quantity;
  }

  const data: Record<string, unknown> = {};
  if (updates.sku !== undefined) data.sku = updates.sku;
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.warehouseId !== undefined) data.warehouseId = updates.warehouseId;
  if (updates.quantity !== undefined) data.quantity = updates.quantity;
  if (updates.unitPrice !== undefined) data.valuePerUnit = updates.unitPrice;
  if (updates.totalVolume !== undefined) data.totalVolume = updates.totalVolume;
  if (updates.quantity !== undefined || updates.unitPrice !== undefined) data.totalValue = totalValue;

  if (Object.keys(data).length === 0) return false;

  data.inboundDate = now();
  const result = updateInventoryItem(String(itemId), data);
  return result !== null;
}

/**
 * 删除库存项
 *
 * @param itemId 库存项 ID
 * @returns 是否删除成功
 */
export function deleteInventory(itemId: number): boolean {
  return deleteInventoryItem(String(itemId));
}

/**
 * 获取库存项详情
 *
 * @param itemId 库存项 ID
 * @returns 库存项详情
 */
export function getInventoryDetail(itemId: number): InventoryItem | null {
  const row = getInventoryItemById(String(itemId));
  if (!row) return null;
  return toInventoryItem(row as Record<string, unknown>);
}

/**
 * 查询库存列表
 *
 * @param filters 筛选条件
 * @returns 库存列表
 */
export function queryInventory(filters?: {
  warehouseId?: string;
  sku?: string;
  name?: string;
  lowStock?: boolean;
}): InventoryItem[] {
  let items = getInventoryItems(filters?.warehouseId) as Array<Record<string, unknown>>;

  if (filters?.sku) {
    items = items.filter((i) => i.sku === filters.sku);
  }

  if (filters?.name) {
    const nameLower = filters.name.toLowerCase();
    items = items.filter((i) => (i.name as string).toLowerCase().includes(nameLower));
  }

  if (filters?.lowStock) {
    items = items.filter((i) => (i.quantity as number) <= 10);
  }

  items = items.sort((a, b) => {
    const wa = String(a.warehouseId);
    const wb = String(b.warehouseId);
    if (wa !== wb) return wa.localeCompare(wb);
    return String(a.sku).localeCompare(String(b.sku));
  });

  return items.map(toInventoryItem);
}

/**
 * 入库操作
 *
 * 流程：
 * 1. 校验商品和仓库
 * 2. 增加库存数量
 * 3. 记录入库历史
 *
 * @param record 入库记录
 * @returns 入库记录 ID
 */
export function inbound(record: Omit<InboundRecord, 'id' | 'createdAt'>): number {
  // 1. 校验
  if (!record.sku || !record.warehouseId || record.quantity <= 0) {
    throw new Error('入库参数错误：SKU、仓库ID、数量必须有效');
  }

  // 2. 增加库存
  const allItems = getInventoryItems(record.warehouseId) as Array<Record<string, unknown>>;
  const existing = allItems.find((i) => i.sku === record.sku) as
    | { id: string; quantity: number; valuePerUnit: number }
    | undefined;

  if (existing) {
    const newQuantity = existing.quantity + record.quantity;
    const newTotalValue = (existing.valuePerUnit || 0) * newQuantity;

    updateInventoryItem(existing.id, {
      quantity: newQuantity,
      totalValue: newTotalValue,
      inboundDate: now(),
    });
  } else {
    // 新商品入库，尝试从记录中获取单价
    const unitPrice = (record as Record<string, unknown>).unitPrice as number | undefined ?? 0;

    createInventoryItem({
      sku: record.sku,
      name: ((record as Record<string, unknown>).productName as string | undefined) ?? record.sku,
      warehouseId: record.warehouseId,
      quantity: record.quantity,
      valuePerUnit: unitPrice,
      totalValue: unitPrice * record.quantity,
      totalVolume: 0,
      inboundDate: now(),
      volumePerUnit: 0,
      category: '',
      autoCreated: 1,
    });
  }

  // 3. 记录入库历史
  const inboundRec = createInboundRecord({
    warehouseId: record.warehouseId,
    sku: record.sku,
    name: ((record as Record<string, unknown>).productName as string | undefined) ?? record.sku,
    quantity: record.quantity,
    volume: 0,
    createdAt: now(),
    operator: record.operator || DEFAULT_OPERATOR,
    status: 'completed',
    supplier: '',
    batchNo: '',
    supplier_id: null,
  });

  logger.info(
    `[Inventory] 入库: sku=${record.sku}, warehouse=${record.warehouseId}, quantity=${record.quantity}`
  );

  return Number(inboundRec.id);
}

/**
 * 出库操作
 *
 * 流程：
 * 1. 校验商品和仓库
 * 2. 校验库存是否充足
 * 3. 扣减库存数量
 * 4. 记录出库历史
 *
 * @param record 出库记录
 * @returns 出库记录 ID
 */
export function outbound(record: Omit<OutboundRecord, 'id' | 'createdAt'>): number {
  // 1. 校验
  if (!record.sku || !record.warehouseId || record.quantity <= 0) {
    throw new Error('出库参数错误：SKU、仓库ID、数量必须有效');
  }

  // 2. 校验库存
  const allItems = getInventoryItems(record.warehouseId) as Array<Record<string, unknown>>;
  const inventory = allItems.find((i) => i.sku === record.sku) as
    | { id: string; quantity: number; valuePerUnit: number }
    | undefined;

  if (!inventory) {
    throw new Error(`商品 ${record.sku} 在仓库 ${record.warehouseId} 不存在`);
  }

  if (inventory.quantity < record.quantity) {
    throw new Error(
      `库存不足：当前库存 ${inventory.quantity}，需要出库 ${record.quantity}`
    );
  }

  // 3. 扣减库存
  const newQuantity = inventory.quantity - record.quantity;
  const newTotalValue = (inventory.valuePerUnit || 0) * newQuantity;

  updateInventoryItem(inventory.id, {
    quantity: newQuantity,
    totalValue: newTotalValue,
    inboundDate: now(),
  });

  // 4. 记录出库历史
  const outboundRec = createOutboundRecord({
    warehouseId: record.warehouseId,
    sku: record.sku,
    name: record.sku,
    quantity: record.quantity,
    volume: 0,
    createdAt: now(),
    operator: record.operator || DEFAULT_OPERATOR,
    destination: '',
    customer: '',
    orderNo: '',
    customer_id: null,
  });

  logger.info(
    `[Inventory] 出库: sku=${record.sku}, warehouse=${record.warehouseId}, quantity=${record.quantity}`
  );

  return Number(outboundRec.id);
}

/**
 * 库存盘点
 *
 * 对比实际库存和系统库存，生成差异报告
 *
 * @param warehouseId 仓库 ID
 * @param actualStock 实际库存数据 {sku: quantity}
 * @returns 盘点差异报告
 */
export function stockCheck(
  warehouseId: string,
  actualStock: Record<string, number>
): {
  matched: Array<{ sku: string; systemQty: number; actualQty: number }>;
  overstock: Array<{ sku: string; systemQty: number; actualQty: number; diff: number }>;
  shortage: Array<{ sku: string; systemQty: number; actualQty: number; diff: number }>;
  missing: Array<{ sku: string; actualQty: number }>;
} {
  const systemStock = getInventoryItems(warehouseId) as Array<{ sku: string; quantity: number }>;

  const systemMap = new Map(systemStock.map((s) => [s.sku, s.quantity]));
  const actualMap = new Map(Object.entries(actualStock));

  const matched: Array<{ sku: string; systemQty: number; actualQty: number }> = [];
  const overstock: Array<{ sku: string; systemQty: number; actualQty: number; diff: number }> = [];
  const shortage: Array<{ sku: string; systemQty: number; actualQty: number; diff: number }> = [];
  const missing: Array<{ sku: string; actualQty: number }> = [];

  // 检查系统库存
  for (const [sku, systemQty] of systemMap) {
    const actualQty = actualMap.get(sku);

    if (actualQty === undefined) {
      // 系统有，实际没有（盘亏）
      shortage.push({ sku, systemQty, actualQty: 0, diff: -systemQty });
    } else if (systemQty === actualQty) {
      matched.push({ sku, systemQty, actualQty });
    } else if (systemQty < actualQty) {
      overstock.push({ sku, systemQty, actualQty, diff: actualQty - systemQty });
    } else {
      shortage.push({ sku, systemQty, actualQty, diff: actualQty - systemQty });
    }
  }

  // 检查实际有但系统没有的
  for (const [sku, actualQty] of actualMap) {
    if (!systemMap.has(sku)) {
      missing.push({ sku, actualQty });
    }
  }

  return { matched, overstock, shortage, missing };
}

/**
 * 获取库存统计
 *
 * @param warehouseId 仓库 ID（可选）
 * @returns 库存统计信息
 */
export function getInventoryStats(warehouseId?: string): {
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  lowStockItems: number;
  zeroStockItems: number;
} {
  const items = getInventoryItems(warehouseId) as Array<{ quantity: number; totalValue: number }>;

  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const totalValue = items.reduce((sum, i) => sum + (i.totalValue || 0), 0);
  const lowStockItems = items.filter((i) => i.quantity <= 10 && i.quantity > 0).length;
  const zeroStockItems = items.filter((i) => i.quantity === 0).length;

  return {
    totalItems,
    totalQuantity,
    totalValue,
    lowStockItems,
    zeroStockItems,
  };
}

// ===================== 兼容导出 =====================

/**
 * 创建入库记录（兼容旧 API）
 * @deprecated 使用 inbound() 替代
 */
export function createInbound(record: Omit<InboundRecord, 'id' | 'createdAt'>): number {
  return inbound(record);
}

/**
 * 创建出库记录（兼容旧 API）
 * @deprecated 使用 outbound() 替代
 */
export function createOutbound(record: Omit<OutboundRecord, 'id' | 'createdAt'>): number {
  return outbound(record);
}
