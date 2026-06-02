/**
 * 在途运单数据 Store（SQLite 持久化 via API）
 * 通过腾讯文档同步后存入，InTransitPage 订阅
 *
 * 改造策略：
 * - 读操作：直接返回内存缓存，保持同步
 * - 写操作：改为 async，调用 API → 成功后更新缓存 → notifyAll()
 * - 新增 initFromApi()，应用启动时调用
 */

import type { TransitOrder } from '../types';
import * as api from '../services/api';

// ====== 内存缓存 ======

let cache: TransitOrder[] = [];

type TransitListener = (orders: TransitOrder[]) => void;
const listeners = new Set<TransitListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn(cache);
    } catch (e) {
      console.error('[transitStore] listener error:', e);
    }
  });
}

/** 获取当前运单列表（快照） */
export function getTransitOrders(): TransitOrder[] {
  return [...cache];
}

/** 订阅运单数据变化 */
export function subscribeTransit(listener: TransitListener): () => void {
  listeners.add(listener);
  listener(cache);
  return () => { listeners.delete(listener); };
}

/** 更新运单列表（全量替换，同步后调用） */
export async function setTransitOrders(newOrders: TransitOrder[]): Promise<void> {
  cache = newOrders;
  notifyAll();
}

/** 添加单个运单 */
export async function addTransitOrder(order: TransitOrder): Promise<void> {
  try {
    const created = await api.createTransitOrder(order);
    cache = [...cache, created];
    notifyAll();
  } catch (e) {
    console.error('[transitStore] addTransitOrder failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'addTransitOrder', error: e } }));
    throw e;
  }
}

/** 更新单个运单（按 id 匹配） */
export async function updateTransitOrder(updated: TransitOrder): Promise<void> {
  try {
    const saved = await api.updateTransitOrder(updated.id, updated);
    cache = cache.map((o) => (o.id === updated.id ? saved : o));
    notifyAll();
  } catch (e) {
    console.error('[transitStore] updateTransitOrder failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'updateTransitOrder', error: e } }));
    throw e;
  }
}

/** 删除单个运单 */
export async function removeTransitOrder(orderId: string): Promise<void> {
  try {
    await api.deleteTransitOrder(orderId);
    cache = cache.filter((o) => o.id !== orderId);
    notifyAll();
  } catch (e) {
    console.error('[transitStore] removeTransitOrder failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'removeTransitOrder', error: e } }));
    throw e;
  }
}

/** 重置为空 */
export async function resetTransitOrders(): Promise<void> {
  cache = [];
  notifyAll();
}

/** 从 API 初始化缓存 */
export async function initFromApi(): Promise<void> {
  try {
    cache = await api.getTransitOrders();
    notifyAll();
  } catch (e) {
    console.error('[transitStore] initFromApi failed:', e);
  }
}
