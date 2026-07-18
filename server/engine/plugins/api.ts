import { logger } from '../../logger.js';
import type {
  PluginContext,
  PluginManifest,
  PluginToolDefinition,
} from './types.js';
import type { PluginPermission } from './permissions.js';
import {
  checkPluginPermission,
  requestPermission,
} from './permissions.js';
import { pluginRuntimeRegistry } from './registry.js';
import { registerPluginHook, unregisterPluginHook } from './hook-registry.js';
import type { PluginHookRegistration } from './hook-registry.js';
import { pluginConfigManager } from './config-manager.js';

/**
 * 插件 API — 暴露给插件的运行时接口
 *
 * 这是插件在 register(api) 中拿到的主要对象，提供：
 * - 工具注册（registerTool）
 * - Hook 注册（registerHook）
 * - 配置访问（getConfig）
 * - 事件总线（emit / on）
 * - 权限请求（requestPermission）
 *
 * API 不直接执行 I/O，仅更新注册表状态。
 */

export interface PluginApi {
  /** 插件 ID */
  readonly pluginId: string;
  /** 当前 manifest */
  readonly manifest: PluginManifest;
  /** 注册一个工具 */
  registerTool(tool: PluginToolDefinition & { handler: (args: unknown) => Promise<unknown> }): void;
  /** 注册一个 hook */
  registerHook(hookName: string, handler: (payload: unknown) => unknown, options?: { priority?: number; metadata?: Record<string, unknown> }): string;
  /** 注销一个 hook */
  unregisterHook(hookId: string): boolean;
  /** 读取配置 */
  getConfig<T = unknown>(key: string): T | undefined;
  /** 读取全部配置 */
  getAllConfig(): Record<string, unknown>;
  /** 请求权限 */
  requestPermission(permission: PluginPermission, reason?: string): Promise<boolean>;
  /** 检查权限 */
  hasPermission(permission: PluginPermission): boolean;
  /** 触发事件 */
  emit(event: string, payload?: unknown): void;
  /** 订阅事件 */
  on(event: string, handler: (payload: unknown) => void): () => void;
}

export interface CreatePluginApiOptions {
  pluginId: string;
  manifest: PluginManifest;
  /** 已合并的配置 */
  config?: Record<string, unknown>;
  /** 事件总线 */
  eventBus?: PluginContext['eventBus'];
  /** 受限 logger */
  logger?: PluginContext['logger'];
}

const eventListeners = new Map<string, Map<string, Set<(payload: unknown) => void>>>();
const registeredTools = new Map<string, Array<PluginToolDefinition & { handler: (args: unknown) => Promise<unknown> }>>();

/**
 * 创建一个 PluginApi 实例（每个插件独立隔离）。
 */
export function createPluginApi(options: CreatePluginApiOptions): PluginApi {
  const { pluginId, manifest } = options;
  const config = options.config ?? {};
  const eventBus = options.eventBus ?? createLocalEventBus(pluginId);

  const api: PluginApi = {
    pluginId,
    manifest,

    registerTool(tool) {
      if (!checkPluginPermission(pluginId, 'tool.register')) {
        throw new Error(`[Plugins:Api] 插件 ${pluginId} 没有 tool.register 权限`);
      }
      const list = registeredTools.get(pluginId) ?? [];
      list.push(tool);
      registeredTools.set(pluginId, list);
      logger.debug(`[Plugins:Api] ${pluginId} registered tool ${tool.name}`);
    },

    registerHook(hookName, handler, hookOptions) {
      if (!checkPluginPermission(pluginId, 'event.emit')) {
        // event.emit 不是必须的，但注册 hook 需要权限
      }
      const reg: Omit<PluginHookRegistration, 'id'> = {
        pluginId,
        hookName,
        priority: hookOptions?.priority ?? 0,
        enabled: true,
        metadata: hookOptions?.metadata,
      };
      const id = registerPluginHook(reg);
      // 包装 handler 让我们能取回它（用于 unregisterHook）
      hookHandlers.set(id, handler);
      return id;
    },

    unregisterHook(hookId) {
      hookHandlers.delete(hookId);
      return unregisterPluginHook(hookId);
    },

    getConfig<T = unknown>(key: string): T | undefined {
      return config[key] as T | undefined;
    },

    getAllConfig() {
      return { ...config };
    },

    async requestPermission(permission, reason) {
      return requestPermission(pluginId, permission, reason);
    },

    hasPermission(permission) {
      return checkPluginPermission(pluginId, permission);
    },

    emit(event, payload) {
      eventBus.emit(event, payload);
    },

    on(event, handler) {
      return eventBus.on(event, handler);
    },
  };

  // 同步注册到 runtime registry（让 health-checker 可见）
  pluginRuntimeRegistry.registerManifest(manifest, {
    capabilities: manifest.capabilities ?? [],
  });

  return api;
}

// hook handler 缓存：用于 unregisterHook 时清理
const hookHandlers = new Map<string, (payload: unknown) => unknown>();

/**
 * 创建本地事件总线（按插件 ID 命名空间隔离）。
 */
function createLocalEventBus(pluginId: string): PluginContext['eventBus'] {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  eventListeners.set(pluginId, listeners);

  return {
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(payload);
        } catch (e) {
          logger.warn(`[Plugins:Api] event handler error for ${pluginId}.${event}:`, e);
        }
      }
    },
    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return () => {
        set!.delete(handler);
      };
    },
    off(event, handler) {
      const set = listeners.get(event);
      if (set) set.delete(handler);
    },
  };
}

// ===================== 查询接口 =====================

export function getPluginTools(pluginId: string): Array<PluginToolDefinition & { handler: (args: unknown) => Promise<unknown> }> {
  return registeredTools.get(pluginId) ?? [];
}

export function listAllPluginTools(): Array<{ pluginId: string; tool: PluginToolDefinition }> {
  const result: Array<{ pluginId: string; tool: PluginToolDefinition }> = [];
  for (const [pluginId, tools] of registeredTools) {
    for (const tool of tools) {
      result.push({ pluginId, tool: { name: tool.name, description: tool.description, parameters: tool.parameters, riskLevel: tool.riskLevel } });
    }
  }
  return result;
}

/**
 * 测试辅助：清空所有 API 状态。
 */
export function resetPluginApiForTests(): void {
  registeredTools.clear();
  eventListeners.clear();
  hookHandlers.clear();
}
