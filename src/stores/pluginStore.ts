/**
 * Plugin Store — 插件全局状态管理
 *
 * v3.0: 使用事件总线模式 + API + 内存缓存（参照 skillStore.ts）
 * 不使用 zustand，与项目现有 Store 模式一致。
 *
 * 操作流程：
 * - 读操作：同步读缓存
 * - 写操作：调 API → 成功后更新缓存 → notifyAll()
 * - 初始化：initFromApi()，应用启动时调用
 */

import * as api from '../services/plugins/api';
import type { PluginInfo, PluginHealth, PluginConfigSchema } from '../services/plugins/api';

// ====== 内存缓存 ======

let plugins: PluginInfo[] = [];
let healthStatus: PluginHealth | null = null;

// ====== 事件总线 ======

type PluginChangeListener = () => void;
const listeners = new Set<PluginChangeListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // console.error('[pluginStore] listener error:', e);
    }
  });
}

// ====== 同步读取 API ======

/** 获取所有插件（同步读缓存） */
export function getPlugins(): PluginInfo[] {
  return plugins;
}

/** 根据 ID 获取单个插件 */
export function getPluginById(id: string): PluginInfo | undefined {
  return plugins.find((p) => p.id === id);
}

/** 获取健康状态 */
export function getHealthStatus(): PluginHealth | null {
  return healthStatus;
}

/** 获取已启用的插件列表 */
export function getEnabledPlugins(): PluginInfo[] {
  return plugins.filter((p) => p.status === 'enabled');
}

/** 获取指定状态的插件 */
export function getPluginsByStatus(status: PluginInfo['status']): PluginInfo[] {
  return plugins.filter((p) => p.status === status);
}

// ====== 异步操作 API ======

/** 全量从 API 刷新插件列表和健康状态 */
export async function refreshFromApi(): Promise<void> {
  try {
    const [result, health] = await Promise.all([
      api.fetchPlugins(),
      api.fetchPluginHealth().catch(() => null),
    ]);
    plugins = result.plugins;
    healthStatus = health;
    notifyAll();
  } catch (e) {
    // console.error('[pluginStore] refreshFromApi failed:', e);
  }
}

/** 安装插件（上传 .zip 文件） */
export async function installPluginAction(file: File): Promise<PluginInfo> {
  try {
    const newPlugin = await api.installPlugin(file);
    // 更新缓存
    const idx = plugins.findIndex((p) => p.id === newPlugin.id);
    if (idx >= 0) {
      plugins[idx] = newPlugin;
    } else {
      plugins = [...plugins, newPlugin];
    }
    notifyAll();
    return newPlugin;
  } catch (e) {
    // console.error('[pluginStore] installPlugin failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', {
      detail: { action: 'installPlugin', error: e },
    }));
    throw e;
  }
}

/** 启用插件 */
export async function enablePluginAction(id: string): Promise<void> {
  try {
    const updated = await api.enablePlugin(id);
    const idx = plugins.findIndex((p) => p.id === id);
    if (idx >= 0) {
      plugins[idx] = updated;
    }
    notifyAll();
  } catch (e) {
    // console.error('[pluginStore] enablePlugin failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', {
      detail: { action: 'enablePlugin', error: e },
    }));
    throw e;
  }
}

/** 禁用插件 */
export async function disablePluginAction(id: string): Promise<void> {
  try {
    const updated = await api.disablePlugin(id);
    const idx = plugins.findIndex((p) => p.id === id);
    if (idx >= 0) {
      plugins[idx] = updated;
    }
    notifyAll();
  } catch (e) {
    // console.error('[pluginStore] disablePlugin failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', {
      detail: { action: 'disablePlugin', error: e },
    }));
    throw e;
  }
}

/** 卸载插件 */
export async function uninstallPluginAction(id: string): Promise<void> {
  try {
    await api.uninstallPlugin(id);
    plugins = plugins.filter((p) => p.id !== id);
    notifyAll();
  } catch (e) {
    // console.error('[pluginStore] uninstallPlugin failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', {
      detail: { action: 'uninstallPlugin', error: e },
    }));
    throw e;
  }
}

/** 重新加载插件 */
export async function reloadPluginAction(id: string): Promise<void> {
  try {
    const updated = await api.reloadPlugin(id);
    const idx = plugins.findIndex((p) => p.id === id);
    if (idx >= 0) {
      plugins[idx] = updated;
    }
    notifyAll();
  } catch (e) {
    // console.error('[pluginStore] reloadPlugin failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', {
      detail: { action: 'reloadPlugin', error: e },
    }));
    throw e;
  }
}

/** 获取插件配置和 Schema */
export async function fetchPluginConfigAction(id: string): Promise<{
  config: Record<string, unknown>;
  configSchema: PluginConfigSchema | null;
}> {
  return await api.fetchPluginConfig(id);
}

/** 更新插件配置 */
export async function updatePluginConfigAction(
  id: string,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return await api.updatePluginConfig(id, config);
}

/** 重置插件配置 */
export async function resetPluginConfigAction(id: string): Promise<Record<string, unknown>> {
  return await api.resetPluginConfig(id);
}

// ====== 订阅 ======

/** 订阅插件数据变化 */
export function onPluginsChange(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

// ====== 初始化 ======

/** 从 API 初始化缓存（应用启动时调用） */
export async function initFromApi(): Promise<void> {
  try {
    const result = await api.fetchPlugins();
    plugins = result.plugins;
    healthStatus = await api.fetchPluginHealth().catch(() => null);
    notifyAll();
  } catch (e) {
    // console.error('[pluginStore] initFromApi failed:', e);
  }
}
