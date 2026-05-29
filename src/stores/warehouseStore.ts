/**
 * 全局仓库数据 Store（localStorage 持久化）
 * WarehouseList 写入，Dashboard/Inventory/InTransit/Reports 等组件订阅
 * 用事件总线模式，与 subscribeRefresh / emitRefresh 一致
 */

import type { Warehouse } from '../types';

// ====== 持久化配置 ======

const STORAGE_KEY = 'crosswms-warehouses';

/** 从 localStorage 读取仓库列表（含旧数据迁移） */
function loadFromStorage(): Warehouse[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // 数据迁移：旧仓库数据缺少 totalItems/usedItems 字段
        return parsed.map((w: Partial<Warehouse>) => {
          // 清理旧字段，避免残留在对象中
          const { totalVolume: _tv, usedVolume: _uv, ...rest } = w as Record<string, unknown>;
          return {
            ...rest,
            totalItems: Number.isFinite(w.totalItems) && w.totalItems! > 0 ? w.totalItems! : Math.max(1, w.totalVolume || 1),
            usedItems: Number.isFinite(w.usedItems) && w.usedItems! >= 0 ? w.usedItems! : (w.usedVolume || 0),
          } as Warehouse;
        });
      }
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/** 写入 localStorage */
function saveToStorage(data: Warehouse[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 存储满或不可用时静默失败
  }
}

// ====== 仓库数据存储 ======

// 启动时从 localStorage 恢复
let warehouses: Warehouse[] = loadFromStorage();

type WarehousesListener = (warehouses: Warehouse[]) => void;
const listeners = new Set<WarehousesListener>();

/** 通知所有监听者 + 持久化 */
function notifyAndPersist(): void {
  saveToStorage(warehouses);
  listeners.forEach((fn) => {
    try {
      fn(warehouses);
    } catch (e) {
      console.error('[warehouseStore] listener error:', e);
    }
  });
}

/** 获取当前仓库列表（快照） */
export function getWarehouses(): Warehouse[] {
  return [...warehouses];
}

/** 按 id 获取单个仓库 */
export function getWarehouseById(id: string): Warehouse | undefined {
  return warehouses.find((w) => w.id === id);
}

/** 订阅仓库数据变化 */
export function subscribeWarehouses(listener: WarehousesListener): () => void {
  listeners.add(listener);
  // 立即回调一次，让新订阅者获取当前数据
  listener(warehouses);
  return () => { listeners.delete(listener); };
}

/** 更新仓库列表（全量替换） */
export function setWarehouses(newWarehouses: Warehouse[]): void {
  warehouses = newWarehouses;
  notifyAndPersist();
}

/** 添加单个仓库 */
export function addWarehouse(warehouse: Warehouse): void {
  warehouses = [...warehouses, warehouse];
  notifyAndPersist();
}

/** 更新单个仓库（按 id 匹配） */
export function updateWarehouse(updated: Warehouse): void {
  warehouses = warehouses.map((w) => (w.id === updated.id ? updated : w));
  notifyAndPersist();
}

/** 删除单个仓库 */
export function removeWarehouse(warehouseId: string): void {
  warehouses = warehouses.filter((w) => w.id !== warehouseId);
  notifyAndPersist();
}

/** 重置为空 */
export function resetWarehouses(): void {
  warehouses = [];
  notifyAndPersist();
}
