/**
 * 库存数据 Store（SQLite 持久化 via API）
 * 通过腾讯文档同步后存入，InventoryPage 订阅
 *
 * 改造策略：
 * - 读操作：直接返回内存缓存，保持同步
 * - 写操作：改为 async，调用 API → 成功后更新缓存 → notifyAll()
 * - 新增 initFromApi()，应用启动时调用
 */

import type { InventoryItem } from '../types';
import * as api from '../services/api';

// ====== 内存缓存 ======

let cache: InventoryItem[] = [];

type InventoryListener = (items: InventoryItem[]) => void;
const listeners = new Set<InventoryListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn(cache);
    } catch (e) {
      console.error('[inventoryStore] listener error:', e);
    }
  });
}

/** 获取当前库存列表（快照） */
export function getInventoryItems(): InventoryItem[] {
  return [...cache];
}

/** 订阅库存数据变化 */
export function subscribeInventory(listener: InventoryListener): () => void {
  listeners.add(listener);
  listener(cache);
  return () => { listeners.delete(listener); };
}

/** 更新库存列表（全量替换，同步后调用） */
export async function setInventoryItems(newItems: InventoryItem[]): Promise<void> {
  cache = newItems;
  notifyAll();
}

/** 添加单个库存项 */
export async function addInventoryItem(item: InventoryItem): Promise<void> {
  try {
    const created = await api.createInventoryItem(item);
    cache = [...cache, created];
    notifyAll();
  } catch (e) {
    console.error('[inventoryStore] addInventoryItem failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'addInventoryItem', error: e } }));
    throw e;
  }
}

/** 更新单个库存项（按 id 匹配） */
export async function updateInventoryItem(updated: InventoryItem): Promise<void> {
  try {
    const saved = await api.updateInventoryItem(updated.id, updated);
    cache = cache.map((item) => (item.id === updated.id ? saved : item));
    notifyAll();
  } catch (e) {
    console.error('[inventoryStore] updateInventoryItem failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'updateInventoryItem', error: e } }));
    throw e;
  }
}

/** 删除单个库存项 */
export async function removeInventoryItem(itemId: string): Promise<void> {
  try {
    await api.deleteInventoryItem(itemId);
    cache = cache.filter((item) => item.id !== itemId);
    notifyAll();
  } catch (e) {
    console.error('[inventoryStore] removeInventoryItem failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'removeInventoryItem', error: e } }));
    throw e;
  }
}

/** 重置为空 */
export async function resetInventoryItems(): Promise<void> {
  cache = [];
  notifyAll();
}

/** 从 API 初始化缓存 */
export async function initFromApi(): Promise<void> {
  try {
    cache = await api.getInventoryItems();
    notifyAll();
  } catch (e) {
    console.error('[inventoryStore] initFromApi failed:', e);
  }
}
