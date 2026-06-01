/**
 * 库存数据 Store（localStorage 持久化）
 * 通过腾讯文档同步后存入，InventoryPage 订阅
 */

import type { InventoryItem } from '../types';

// ====== 持久化配置 ======

const STORAGE_KEY = 'crosswms-inventory-items';

/** 从 localStorage 读取库存列表 */
function loadFromStorage(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as InventoryItem[];
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/** 写入 localStorage */
function saveToStorage(data: InventoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(`[${STORAGE_KEY}] 保存失败:`, e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('crosswms-storage-warning', { detail: { key: STORAGE_KEY } }));
    }
  }
}

// ====== 数据存储 ======

let inventoryItems: InventoryItem[] = loadFromStorage();

type InventoryListener = (items: InventoryItem[]) => void;
const listeners = new Set<InventoryListener>();

/** 通知所有监听者 + 持久化 */
function notifyAndPersist(): void {
  saveToStorage(inventoryItems);
  listeners.forEach((fn) => {
    try {
      fn(inventoryItems);
    } catch (e) {
      console.error('[inventoryStore] listener error:', e);
    }
  });
}

/** 获取当前库存列表（快照） */
export function getInventoryItems(): InventoryItem[] {
  return [...inventoryItems];
}

/** 订阅库存数据变化 */
export function subscribeInventory(listener: InventoryListener): () => void {
  listeners.add(listener);
  listener(inventoryItems);
  return () => { listeners.delete(listener); };
}

/** 更新库存列表（全量替换，同步后调用） */
export function setInventoryItems(newItems: InventoryItem[]): void {
  inventoryItems = newItems;
  notifyAndPersist();
}

/** 添加单个库存项 */
export function addInventoryItem(item: InventoryItem): void {
  inventoryItems = [...inventoryItems, item];
  notifyAndPersist();
}

/** 更新单个库存项（按 id 匹配） */
export function updateInventoryItem(updated: InventoryItem): void {
  inventoryItems = inventoryItems.map((item) => (item.id === updated.id ? updated : item));
  notifyAndPersist();
}

/** 删除单个库存项 */
export function removeInventoryItem(itemId: string): void {
  inventoryItems = inventoryItems.filter((item) => item.id !== itemId);
  notifyAndPersist();
}

/** 重置为空 */
export function resetInventoryItems(): void {
  inventoryItems = [];
  notifyAndPersist();
}
