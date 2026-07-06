/**
 * Extension Store — 扩展全局状态管理
 *
 * 使用事件总线模式 + API + 内存缓存，与 pluginStore 保持一致。
 */

import * as api from '../services/extensions/api';
import type {
  ExtensionInfo,
  ExtensionStats,
  ExtensionKind,
} from '../services/extensions/api';

// ====== 内存缓存 ======

let extensions: ExtensionInfo[] = [];
let discovered: ExtensionInfo[] = [];
let stats: ExtensionStats | null = null;
let kinds: ExtensionKind[] = [];
let loading = false;
let discovering = false;
const actionLoading = new Set<string>();
let error: string | null = null;

// ====== 事件总线 ======

type ExtensionChangeListener = () => void;
const listeners = new Set<ExtensionChangeListener>();

function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // ignore
    }
  });
}

// ====== 同步读取 API ======

export function getExtensions(): ExtensionInfo[] {
  return extensions;
}

export function getDiscoveredExtensions(): ExtensionInfo[] {
  return discovered;
}

export function getExtensionStats(): ExtensionStats | null {
  return stats;
}

export function getExtensionKinds(): ExtensionKind[] {
  return kinds;
}

export function isExtensionLoading(): boolean {
  return loading;
}

export function isExtensionDiscovering(): boolean {
  return discovering;
}

export function isExtensionActionLoading(id: string): boolean {
  return actionLoading.has(id);
}

export function getExtensionError(): string | null {
  return error;
}

// ====== 订阅接口 ======

export function onExtensionsChange(listener: ExtensionChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ====== 写操作 API ======

export async function refreshExtensionsFromApi(params?: {
  kind?: string;
  enabled?: boolean;
}): Promise<void> {
  loading = true;
  error = null;
  notifyAll();

  try {
    extensions = await api.fetchExtensions(params);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
    notifyAll();
  }
}

export async function refreshExtensionStats(): Promise<void> {
  try {
    stats = await api.fetchExtensionStats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  notifyAll();
}

export async function refreshExtensionKinds(): Promise<void> {
  try {
    kinds = await api.fetchExtensionKinds();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  notifyAll();
}

export async function discoverExtensionsFromApi(): Promise<void> {
  discovering = true;
  error = null;
  notifyAll();

  try {
    discovered = await api.discoverExtensions();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    discovering = false;
    notifyAll();
  }
}

export async function enableExtensionAction(
  id: string,
  config?: Record<string, unknown>,
): Promise<void> {
  actionLoading.add(id);
  error = null;
  notifyAll();

  try {
    await api.enableExtension(id, config);
    await refreshExtensionsFromApi();
    await refreshExtensionStats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    actionLoading.delete(id);
    notifyAll();
  }
}

export async function disableExtensionAction(id: string): Promise<void> {
  actionLoading.add(id);
  error = null;
  notifyAll();

  try {
    await api.disableExtension(id);
    await refreshExtensionsFromApi();
    await refreshExtensionStats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    actionLoading.delete(id);
    notifyAll();
  }
}

export async function loadExtensionAction(id: string): Promise<void> {
  actionLoading.add(id);
  error = null;
  notifyAll();

  try {
    await api.loadExtension(id);
    await refreshExtensionsFromApi();
    await refreshExtensionStats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    actionLoading.delete(id);
    notifyAll();
  }
}

export async function loadAllExtensionsAction(): Promise<void> {
  loading = true;
  error = null;
  notifyAll();

  try {
    await api.loadAllExtensions();
    await refreshExtensionsFromApi();
    await refreshExtensionStats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
    notifyAll();
  }
}

export function clearExtensionError(): void {
  error = null;
  notifyAll();
}

export async function initExtensionsFromApi(): Promise<void> {
  await Promise.all([
    refreshExtensionsFromApi(),
    refreshExtensionStats(),
    refreshExtensionKinds(),
  ]);
}