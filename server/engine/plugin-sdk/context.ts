import { logger as hostLogger } from '../../logger.js';
import type {
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginEventBus,
  PluginConfigAccessor,
} from '../plugins/types.js';
import { checkPluginPermission } from '../plugins/permissions.js';
import type { PluginPermission } from '../plugins/permissions.js';

/**
 * 插件上下文工厂 — 为每个插件构造独立的 logger / storage / fetch / eventBus
 *
 * 参考 openclaw/src/plugin-sdk/plugin-runtime.ts 中 PluginRuntime 的构造方式，
 * 但精简到本仓库需要的最小集合。
 */

export interface CreatePluginContextOptions {
  pluginId: string;
  /** 插件 manifest（用于权限检查、配置 schema） */
  manifest: import('../plugins/types.js').PluginManifest;
  /** 已合并的配置 */
  config?: Record<string, unknown>;
  /** 权限检查回调（默认使用 plugins/permissions.ts 的 checkPluginPermission） */
  hasPermission?: (permission: import('../plugins/permissions.js').PluginPermission) => boolean;
  /** 自定义存储后端（默认使用内存 Map） */
  storage?: PluginStorage;
  /** 自定义事件总线（默认使用本地实现） */
  eventBus?: PluginEventBus;
  /** 自定义 fetch 实现 */
  fetchImpl?: import('../plugins/types.js').PluginFetch;
}

/**
 * 创建受限 logger — 自动给所有日志加上 pluginId 前缀。
 */
export function createPluginLogger(pluginId: string): PluginLogger {
  const prefix = `[plugin:${pluginId}]`;
  return {
    debug: (...args) => hostLogger.debug(prefix, ...args),
    info: (...args) => hostLogger.info(prefix, ...args),
    warn: (...args) => hostLogger.warn(prefix, ...args),
    error: (...args) => hostLogger.error(prefix, ...args),
  };
}

/**
 * 创建按插件 ID 命名空间隔离的内存存储。
 */
export function createPluginStorage(pluginId: string): PluginStorage {
  const store = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const namespaced = `${pluginId}:${key}`;
      return store.get(namespaced) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      const namespaced = `${pluginId}:${key}`;
      store.set(namespaced, value);
    },
    async delete(key: string): Promise<void> {
      const namespaced = `${pluginId}:${key}`;
      store.delete(namespaced);
    },
    async keys(): Promise<string[]> {
      const prefix = `${pluginId}:`;
      return Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    },
  };
}

/**
 * 创建本地事件总线（不跨插件）。
 */
export function createPluginEventBus(pluginId: string): PluginEventBus {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(payload);
        } catch (e) {
          hostLogger.warn(`[plugin:${pluginId}] event handler error for ${event}:`, e);
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

/**
 * 创建配置访问器（只读视图）。
 */
export function createPluginConfigAccessor(config: Record<string, unknown>): PluginConfigAccessor {
  return {
    get<T = unknown>(key: string): T | undefined {
      return config[key] as T | undefined;
    },
    getAll(): Record<string, unknown> {
      return { ...config };
    },
  };
}

/**
 * 创建完整的 PluginContext。
 *
 * 默认使用 plugins/permissions.ts 的 checkPluginPermission 实现权限检查。
 */
export function createPluginContext(options: CreatePluginContextOptions): PluginContext {
  const config = options.config ?? {};
  let hasPermission = options.hasPermission;
  if (!hasPermission) {
    hasPermission = (perm) => checkPluginPermission(options.pluginId, perm);
  }

  return {
    pluginId: options.pluginId,
    manifest: options.manifest,
    logger: createPluginLogger(options.pluginId),
    storage: options.storage ?? createPluginStorage(options.pluginId),
    fetch: options.fetchImpl ?? ((async () => {
      throw new Error(`[plugin:${options.pluginId}] fetch 未配置`);
    }) as import('../plugins/types.js').PluginFetch),
    eventBus: options.eventBus ?? createPluginEventBus(options.pluginId),
    config: createPluginConfigAccessor(config),
    hasPermission,
  };
}

/**
 * 测试辅助：返回一个最小化的 PluginContext（所有 API 都为 no-op）。
 */
export function createNoopPluginContext(pluginId: string): PluginContext {
  const noop = () => {};
  const noopAsync = async () => undefined;
  return {
    pluginId,
    manifest: { id: pluginId, name: pluginId, version: '0.0.0' },
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    storage: {
      get: noopAsync as <T = unknown>(key: string) => Promise<T | undefined>,
      set: noopAsync as (key: string, value: unknown) => Promise<void>,
      delete: noopAsync as (key: string) => Promise<void>,
      keys: (async () => []) as () => Promise<string[]>,
    },
    fetch: (async () => {
      throw new Error('fetch not configured');
    }) as import('../plugins/types.js').PluginFetch,
    eventBus: {
      emit: noop,
      on: () => noop,
      off: noop,
    },
    config: {
      get: () => undefined,
      getAll: () => ({}),
    },
    hasPermission: () => false,
  };
}
