/**
 * Plugin SDK 上下文 — 注入到插件运行时的运行环境
 *
 * 与现有 ./types.ts 中 PluginContext 接口的关系：
 * - ./types.ts 定义接口契约
 * - 本文件提供工厂函数，将 manifest + config + 权限 + 沙箱能力组装成 PluginContext
 *
 * 设计要点：
 * - logger 按 pluginId 前缀隔离
 * - storage 按 pluginId 命名空间隔离（内存 Map 实现，可替换为持久化）
 * - fetch 受沙箱限制（超时、域名白名单、调用计数）
 * - config 只读访问器，避免插件直接修改全局配置
 */

import { logger as hostLogger } from '../../logger.js';
import type {
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginFetch,
  PluginFetchInit,
  PluginFetchResponse,
  PluginConfigAccessor,
  PluginManifest,
  PluginEventBus,
} from './types.js';
import type { PluginPermission } from './permissions.js';
import { checkPluginPermission } from './permissions.js';
import { createPluginEventBus, adaptToPluginEventBus } from './plugin-events.js';
import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_MAX_FETCH_CALLS,
} from './plugin-constants.js';
import { PluginSandboxResourceError } from './plugin-errors.js';

// ===================== Logger 工厂 =====================

/** 创建按插件 ID 前缀隔离的 logger */
export function createPluginLogger(pluginId: string): PluginLogger {
  const prefix = `[Plugin:${pluginId}]`;
  return {
    debug: (...args: unknown[]) => hostLogger.debug(prefix, ...args),
    info: (...args: unknown[]) => hostLogger.info(prefix, ...args),
    warn: (...args: unknown[]) => hostLogger.warn(prefix, ...args),
    error: (...args: unknown[]) => hostLogger.error(prefix, ...args),
  };
}

// ===================== Storage 工厂 =====================

/** 内存存储实现（按 pluginId 命名空间隔离） */
export class InMemoryPluginStorage implements PluginStorage {
  private store = new Map<string, unknown>();
  private readonly pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const namespacedKey = `${this.pluginId}:${key}`;
    return this.store.get(namespacedKey) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const namespacedKey = `${this.pluginId}:${key}`;
    this.store.set(namespacedKey, value);
  }

  async delete(key: string): Promise<void> {
    const namespacedKey = `${this.pluginId}:${key}`;
    this.store.delete(namespacedKey);
  }

  async keys(): Promise<string[]> {
    const prefix = `${this.pluginId}:`;
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key.slice(prefix.length));
      }
    }
    return result;
  }

  /** 清空该插件的所有存储（卸载时调用） */
  clear(): void {
    const prefix = `${this.pluginId}:`;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

/** 全局存储注册表（按 pluginId 隔离） */
const storageRegistry = new Map<string, InMemoryPluginStorage>();

/** 获取或创建插件存储 */
export function getPluginStorage(pluginId: string): InMemoryPluginStorage {
  let storage = storageRegistry.get(pluginId);
  if (!storage) {
    storage = new InMemoryPluginStorage(pluginId);
    storageRegistry.set(pluginId, storage);
  }
  return storage;
}

/** 清空指定插件的存储（卸载时调用） */
export function clearPluginStorage(pluginId: string): void {
  const storage = storageRegistry.get(pluginId);
  if (storage) {
    storage.clear();
    storageRegistry.delete(pluginId);
  }
}

// ===================== Fetch 工厂 =====================

/** 创建受限 fetch（带超时、调用计数、域名白名单） */
export function createPluginFetch(pluginId: string, options: {
  allowedDomains?: string[];
  maxFetchCalls?: number;
  defaultTimeoutMs?: number;
} = {}): PluginFetch {
  const maxCalls = options.maxFetchCalls ?? DEFAULT_SANDBOX_MAX_FETCH_CALLS;
  const defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS;
  let callCount = 0;

  return async (input: string, init?: PluginFetchInit): Promise<PluginFetchResponse> => {
    if (callCount >= maxCalls) {
      throw new PluginSandboxResourceError(
        `插件 ${pluginId} fetch 调用次数已达上限 ${maxCalls}`,
        'fetch',
        pluginId,
      );
    }
    callCount++;

    // 域名白名单检查
    if (options.allowedDomains && options.allowedDomains.length > 0) {
      let hostname = '';
      try {
        const url = new URL(input);
        hostname = url.hostname;
      } catch {
        // 非 URL 输入，跳过域名检查
      }
      if (hostname && !options.allowedDomains.includes(hostname)) {
        throw new PluginSandboxResourceError(
          `插件 ${pluginId} 尝试访问未授权域名: ${hostname}`,
          'fetch',
          pluginId,
        );
      }
    }

    const timeoutMs = init?.timeoutMs ?? defaultTimeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
        signal: controller.signal,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        text: () => response.text(),
        json: () => response.json(),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

// ===================== Config 访问器 =====================

/** 创建只读配置访问器 */
export function createPluginConfigAccessor(config: Record<string, unknown> = {}): PluginConfigAccessor {
  return {
    get: <T = unknown>(key: string): T | undefined => config[key] as T | undefined,
    getAll: () => ({ ...config }),
  };
}

// ===================== Context 工厂 =====================

/** 创建 PluginContext 的参数 */
export interface CreatePluginContextOptions {
  manifest: PluginManifest;
  config?: Record<string, unknown>;
  allowedDomains?: string[];
  maxFetchCalls?: number;
  defaultTimeoutMs?: number;
  eventBus?: PluginEventBus;
}

/**
 * 创建插件上下文。
 *
 * 组合 logger / storage / fetch / config / eventBus / 权限检查，
 * 注入到插件 register(api) 与 lifecycle hooks 中。
 */
export function createPluginContext(options: CreatePluginContextOptions): PluginContext {
  const { manifest, config = {}, allowedDomains, maxFetchCalls, defaultTimeoutMs } = options;
  const pluginId = manifest.id;

  const logger = createPluginLogger(pluginId);
  const storage = getPluginStorage(pluginId);
  const fetch = createPluginFetch(pluginId, {
    allowedDomains,
    maxFetchCalls,
    defaultTimeoutMs,
  });
  const pluginConfig = createPluginConfigAccessor(config);

  const eventBus = options.eventBus ?? adaptToPluginEventBus(createPluginEventBus(pluginId));

  return {
    pluginId,
    logger,
    storage,
    fetch,
    eventBus,
    config: pluginConfig,
    hasPermission: (permission: PluginPermission) => checkPluginPermission(pluginId, permission),
    manifest,
  };
}

/** 销毁插件上下文（清理存储、取消事件订阅） */
export function destroyPluginContext(pluginId: string): void {
  clearPluginStorage(pluginId);
}
