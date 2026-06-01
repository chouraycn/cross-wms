/**
 * 在途运单数据 Store（localStorage 持久化）
 * 通过腾讯文档同步后存入，InTransitPage 订阅
 */

import type { TransitOrder } from '../types';

// ====== 持久化配置 ======

const STORAGE_KEY = 'crosswms-transit-orders';

/** 从 localStorage 读取运单列表 */
function loadFromStorage(): TransitOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as TransitOrder[];
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/** 写入 localStorage */
function saveToStorage(data: TransitOrder[]): void {
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

let transitOrders: TransitOrder[] = loadFromStorage();

type TransitListener = (orders: TransitOrder[]) => void;
const listeners = new Set<TransitListener>();

/** 通知所有监听者 + 持久化 */
function notifyAndPersist(): void {
  saveToStorage(transitOrders);
  listeners.forEach((fn) => {
    try {
      fn(transitOrders);
    } catch (e) {
      console.error('[transitStore] listener error:', e);
    }
  });
}

/** 获取当前运单列表（快照） */
export function getTransitOrders(): TransitOrder[] {
  return [...transitOrders];
}

/** 订阅运单数据变化 */
export function subscribeTransit(listener: TransitListener): () => void {
  listeners.add(listener);
  listener(transitOrders);
  return () => { listeners.delete(listener); };
}

/** 更新运单列表（全量替换，同步后调用） */
export function setTransitOrders(newOrders: TransitOrder[]): void {
  transitOrders = newOrders;
  notifyAndPersist();
}

/** 添加单个运单 */
export function addTransitOrder(order: TransitOrder): void {
  transitOrders = [...transitOrders, order];
  notifyAndPersist();
}

/** 更新单个运单（按 id 匹配） */
export function updateTransitOrder(updated: TransitOrder): void {
  transitOrders = transitOrders.map((o) => (o.id === updated.id ? updated : o));
  notifyAndPersist();
}

/** 删除单个运单 */
export function removeTransitOrder(orderId: string): void {
  transitOrders = transitOrders.filter((o) => o.id !== orderId);
  notifyAndPersist();
}

/** 重置为空 */
export function resetTransitOrders(): void {
  transitOrders = [];
  notifyAndPersist();
}
