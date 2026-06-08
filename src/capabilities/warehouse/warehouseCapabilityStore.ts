/**
 * 仓储能力统一 Store
 *
 * 合并 warehouseStore / transitStore / inventoryStore 为一个统一数据层。
 * 共享一个 listeners 集合，任意数据变更通知所有订阅者，
 * 使得 Dashboard 无需 subscribeRefresh 即可感知写操作后的数据变化。
 *
 * 改造策略：
 * - 读操作（get/list）：直接返回内存缓存，保持同步
 * - 写操作（add/update/remove/set/reset）：async，调用 API → 成功后更新缓存 → notifyAll()
 * - initFromApi 合并为一个，并行拉取三类数据
 * - 报错继续 dispatch cdf-know-clow-api-error 事件
 */

import type { Warehouse, TransitOrder, InventoryItem } from '../../types';
import * as api from '../../services/api';

// ====== 统一状态接口 ======

export interface WarehouseCapabilityState {
  warehouses: Warehouse[];
  transitOrders: TransitOrder[];
  inventory: InventoryItem[];
}

type CapabilityListener = (state: WarehouseCapabilityState) => void;

// ====== 内存缓存 ======

let warehouseCache: Warehouse[] = [];
let transitCache: TransitOrder[] = [];
let inventoryCache: InventoryItem[] = [];

const listeners = new Set<CapabilityListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  const state: WarehouseCapabilityState = {
    warehouses: [...warehouseCache],
    transitOrders: [...transitCache],
    inventory: [...inventoryCache],
  };
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.error('[warehouseCapabilityStore] listener error:', e);
    }
  });
}

// ====== 订阅 ======

/** 订阅仓储能力数据变化，返回取消订阅函数 */
export function subscribeCapability(listener: CapabilityListener): () => void {
  listeners.add(listener);
  // 立即回调一次，让新订阅者获取当前数据
  listener({
    warehouses: [...warehouseCache],
    transitOrders: [...transitCache],
    inventory: [...inventoryCache],
  });
  return () => {
    listeners.delete(listener);
  };
}

/** 兼容旧接口：仅订阅仓库列表变化 */
export function subscribeWarehouses(callback: (warehouses: Warehouse[]) => void): () => void {
  return subscribeCapability((state) => callback(state.warehouses));
}

// ====== 仓库 读操作 ======

/** 获取当前仓库列表（快照） */
export function getWarehouses(): Warehouse[] {
  return [...warehouseCache];
}

/** 按 id 获取单个仓库 */
export function getWarehouseById(id: string): Warehouse | undefined {
  return warehouseCache.find((w) => w.id === id);
}

/** 获取仓库完整视图（仓库 + 关联在途 + 关联库存） */
export function getWarehouseFullView(id: string): {
  warehouse: Warehouse | undefined;
  transit: TransitOrder[];
  inventory: InventoryItem[];
} {
  return {
    warehouse: warehouseCache.find((w) => w.id === id),
    transit: transitCache.filter((t) => t.fromWarehouseId === id || t.toWarehouseId === id),
    inventory: inventoryCache.filter((item) => item.warehouseId === id),
  };
}

// ====== 仓库 写操作 ======

/** 更新仓库列表（全量替换） */
export function setWarehouses(newWarehouses: Warehouse[]): void {
  warehouseCache = newWarehouses;
  notifyAll();
}

/** 添加单个仓库 */
export async function addWarehouse(warehouse: Warehouse): Promise<void> {
  try {
    const created = await api.createWarehouse(warehouse);
    warehouseCache = [...warehouseCache, created];
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] addWarehouse failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'addWarehouse', error: e } }));
    throw e;
  }
}

/** 更新单个仓库（按 id 匹配） */
export async function updateWarehouse(updated: Warehouse): Promise<void> {
  try {
    const saved = await api.updateWarehouse(updated.id, updated);
    warehouseCache = warehouseCache.map((w) => (w.id === updated.id ? saved : w));
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] updateWarehouse failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'updateWarehouse', error: e } }));
    throw e;
  }
}

/** 删除单个仓库 */
export async function removeWarehouse(warehouseId: string): Promise<void> {
  try {
    await api.deleteWarehouse(warehouseId);
    warehouseCache = warehouseCache.filter((w) => w.id !== warehouseId);
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] removeWarehouse failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'removeWarehouse', error: e } }));
    throw e;
  }
}

/** 重置仓库为空 */
export function resetWarehouses(): void {
  warehouseCache = [];
  notifyAll();
}

// ====== 在途 读操作 ======

/** 获取当前运单列表（快照） */
export function getTransitOrders(): TransitOrder[] {
  return [...transitCache];
}

// ====== 在途 写操作 ======

/** 更新运单列表（全量替换，同步后调用） */
export function setTransitOrders(newOrders: TransitOrder[]): void {
  transitCache = newOrders;
  notifyAll();
}

/** 添加单个运单 */
export async function addTransitOrder(order: TransitOrder): Promise<void> {
  try {
    const created = await api.createTransitOrder(order);
    transitCache = [...transitCache, created];
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] addTransitOrder failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'addTransitOrder', error: e } }));
    throw e;
  }
}

/** 更新单个运单（按 id 匹配） */
export async function updateTransitOrder(updated: TransitOrder): Promise<void> {
  try {
    const saved = await api.updateTransitOrder(updated.id, updated);
    transitCache = transitCache.map((o) => (o.id === updated.id ? saved : o));
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] updateTransitOrder failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'updateTransitOrder', error: e } }));
    throw e;
  }
}

/** 删除单个运单 */
export async function removeTransitOrder(orderId: string): Promise<void> {
  try {
    await api.deleteTransitOrder(orderId);
    transitCache = transitCache.filter((o) => o.id !== orderId);
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] removeTransitOrder failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'removeTransitOrder', error: e } }));
    throw e;
  }
}

/** 重置运单为空 */
export function resetTransitOrders(): void {
  transitCache = [];
  notifyAll();
}

// ====== 库存 读操作 ======

/** 获取当前库存列表（快照） */
export function getInventoryItems(): InventoryItem[] {
  return [...inventoryCache];
}

// ====== 库存 写操作 ======

/** 更新库存列表（全量替换，同步后调用） */
export function setInventoryItems(newItems: InventoryItem[]): void {
  inventoryCache = newItems;
  notifyAll();
}

/** 添加单个库存项 */
export async function addInventoryItem(item: InventoryItem): Promise<void> {
  try {
    const created = await api.createInventoryItem(item);
    inventoryCache = [...inventoryCache, created];
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] addInventoryItem failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'addInventoryItem', error: e } }));
    throw e;
  }
}

/** 更新单个库存项（按 id 匹配） */
export async function updateInventoryItem(updated: InventoryItem): Promise<void> {
  try {
    const saved = await api.updateInventoryItem(updated.id, updated);
    inventoryCache = inventoryCache.map((item) => (item.id === updated.id ? saved : item));
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] updateInventoryItem failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'updateInventoryItem', error: e } }));
    throw e;
  }
}

/** 删除单个库存项 */
export async function removeInventoryItem(itemId: string): Promise<void> {
  try {
    await api.deleteInventoryItem(itemId);
    inventoryCache = inventoryCache.filter((item) => item.id !== itemId);
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] removeInventoryItem failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'removeInventoryItem', error: e } }));
    throw e;
  }
}

/** 重置库存为空 */
export function resetInventoryItems(): void {
  inventoryCache = [];
  notifyAll();
}

// ====== 统一初始化 ======

/** 从 API 初始化所有缓存（合并原3个 initFromApi 为并行拉取） */
export async function initFromApi(): Promise<void> {
  try {
    const [warehouses, transitOrders, inventoryItems] = await Promise.all([
      api.getWarehouses(),
      api.getTransitOrders(),
      api.getInventoryItems(),
    ]);
    warehouseCache = warehouses;
    transitCache = transitOrders;
    inventoryCache = inventoryItems;
    notifyAll();
  } catch (e) {
    console.error('[warehouseCapabilityStore] initFromApi failed:', e);
  }
}
