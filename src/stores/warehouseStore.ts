/**
 * 全局仓库数据 Store（SQLite 持久化 via API）
 * WarehouseList 写入，Dashboard/Inventory/InTransit/Reports 等组件订阅
 * 用事件总线模式，与 subscribeRefresh / emitRefresh 一致
 *
 * 改造策略：
 * - 读操作（get/list）：直接返回内存缓存，保持同步
 * - 写操作（add/update/remove/set/reset）：改为 async，调用 API → 成功后更新缓存 → notifyAll()
 * - 新增 initFromApi()，应用启动时调用
 */

import type { Warehouse } from '../types';
import * as api from '../services/api';

// 重新导出 Warehouse 类型，方便其他模块引用
export type { Warehouse } from '../types';

// ====== 内存缓存 ======

let cache: Warehouse[] = [];

type WarehousesListener = (warehouses: Warehouse[]) => void;
const listeners = new Set<WarehousesListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn(cache);
    } catch (e) {
      console.error('[warehouseStore] listener error:', e);
    }
  });
}

/** 获取当前仓库列表（快照） */
export function getWarehouses(): Warehouse[] {
  return [...cache];
}

/** 按 id 获取单个仓库 */
export function getWarehouseById(id: string): Warehouse | undefined {
  return cache.find((w) => w.id === id);
}

/** 订阅仓库数据变化 */
export function subscribeWarehouses(listener: WarehousesListener): () => void {
  listeners.add(listener);
  // 立即回调一次，让新订阅者获取当前数据
  listener(cache);
  return () => { listeners.delete(listener); };
}

/** 更新仓库列表（全量替换） */
export async function setWarehouses(newWarehouses: Warehouse[]): Promise<void> {
  cache = newWarehouses;
  notifyAll();
}

/** 添加单个仓库 */
export async function addWarehouse(warehouse: Warehouse): Promise<void> {
  try {
    const created = await api.createWarehouse(warehouse);
    cache = [...cache, created];
    notifyAll();
  } catch (e) {
    console.error('[warehouseStore] addWarehouse failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'addWarehouse', error: e } }));
    throw e;
  }
}

/** 更新单个仓库（按 id 匹配） */
export async function updateWarehouse(updated: Warehouse): Promise<void> {
  try {
    const saved = await api.updateWarehouse(updated.id, updated);
    cache = cache.map((w) => (w.id === updated.id ? saved : w));
    notifyAll();
  } catch (e) {
    console.error('[warehouseStore] updateWarehouse failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'updateWarehouse', error: e } }));
    throw e;
  }
}

/** 删除单个仓库 */
export async function removeWarehouse(warehouseId: string): Promise<void> {
  try {
    await api.deleteWarehouse(warehouseId);
    cache = cache.filter((w) => w.id !== warehouseId);
    notifyAll();
  } catch (e) {
    console.error('[warehouseStore] removeWarehouse failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'removeWarehouse', error: e } }));
    throw e;
  }
}

/** 重置为空 */
export async function resetWarehouses(): Promise<void> {
  cache = [];
  notifyAll();
}

/** 从 API 初始化缓存 */
export async function initFromApi(): Promise<void> {
  try {
    cache = await api.getWarehouses();
    notifyAll();
  } catch (e) {
    console.error('[warehouseStore] initFromApi failed:', e);
  }
}
