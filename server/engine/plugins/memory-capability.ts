/**
 * Memory 能力提供者 — 记忆存储能力
 *
 * 插件可注册自定义记忆存储后端（如向量库、键值存储）。
 * 与 server/engine/plugins/memory-runtime.ts 互补：
 * - memory-runtime.ts 负责解析配置中的 memory slot 并加载对应运行时
 * - 本文件提供 SDK 层的能力注册与调用接口
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';

/** 记忆条目 */
export interface MemoryRecord {
  /** 唯一 ID */
  id: string;
  /** 内容 */
  content: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt?: number;
}

/** 记忆查询选项 */
export interface MemoryQueryOptions {
  /** 会话 ID */
  sessionId?: string;
  /** 关键词 */
  query?: string;
  /** 标签过滤 */
  tags?: string[];
  /** 返回上限 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 记忆查询结果 */
export interface MemoryQueryResult {
  records: MemoryRecord[];
  total: number;
  hasMore: boolean;
}

/** 记忆写入选项 */
export interface MemoryWriteOptions {
  /** 会话 ID */
  sessionId?: string;
  /** 内容 */
  content: string;
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 记忆写入结果 */
export interface MemoryWriteResult {
  ok: boolean;
  recordId?: string;
  error?: string;
}

/** 记忆能力调用选项 */
export interface MemoryCapabilityOptions {
  /** 操作类型 */
  operation: 'read' | 'write' | 'delete' | 'query';
  /** 读取/删除时使用 */
  recordId?: string;
  /** 写入时使用 */
  write?: MemoryWriteOptions;
  /** 查询时使用 */
  query?: MemoryQueryOptions;
  /** 会话 ID */
  sessionId?: string;
}

/** 记忆能力调用结果 */
export interface MemoryCapabilityResult {
  ok: boolean;
  records?: MemoryRecord[];
  recordId?: string;
  total?: number;
  error?: string;
}

/** 记忆能力提供者接口 */
export type MemoryCapabilityProvider = CapabilityProvider<MemoryCapabilityOptions, MemoryCapabilityResult> & {
  /** 读取单条记忆 */
  read?(recordId: string): Promise<MemoryRecord | undefined>;
  /** 写入记忆 */
  write?(options: MemoryWriteOptions): Promise<MemoryWriteResult>;
  /** 删除记忆 */
  delete?(recordId: string): Promise<boolean>;
  /** 查询记忆 */
  query?(options: MemoryQueryOptions): Promise<MemoryQueryResult>;
  /** 清空会话记忆 */
  clear?(sessionId?: string): Promise<number>;
};

// ===================== 注册与调用 =====================

/** 注册 Memory 能力提供者 */
export function registerMemoryProvider(
  pluginId: string,
  provider: MemoryCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Memory 能力提供者 */
export function unregisterMemoryProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('memory-host', providerId);
}

/** 调用记忆能力 */
export async function invokeMemory(
  providerId: string,
  options: MemoryCapabilityOptions,
): Promise<MemoryCapabilityResult> {
  const entry = capabilityProviderRegistry.find<MemoryCapabilityOptions, MemoryCapabilityResult>('memory-host', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到记忆提供者: ${providerId}`, `memory-host:${providerId}`);
  }

  try {
    return await entry.provider.invoke(options);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 读取记忆 */
export async function readMemory(providerId: string, recordId: string): Promise<MemoryRecord | undefined> {
  const entry = capabilityProviderRegistry.find<MemoryCapabilityOptions, MemoryCapabilityResult>('memory-host', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到记忆提供者: ${providerId}`, `memory-host:${providerId}`);
  }
  const provider = entry.provider as MemoryCapabilityProvider;
  if (!provider.read) {
    throw new PluginCapabilityError(`记忆提供者 ${providerId} 不支持 read`, `memory-host:${providerId}`);
  }
  return provider.read(recordId);
}

/** 写入记忆 */
export async function writeMemory(providerId: string, options: MemoryWriteOptions): Promise<MemoryWriteResult> {
  const entry = capabilityProviderRegistry.find<MemoryCapabilityOptions, MemoryCapabilityResult>('memory-host', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到记忆提供者: ${providerId}`, `memory-host:${providerId}`);
  }
  const provider = entry.provider as MemoryCapabilityProvider;
  if (!provider.write) {
    throw new PluginCapabilityError(`记忆提供者 ${providerId} 不支持 write`, `memory-host:${providerId}`);
  }
  return provider.write(options);
}

/** 查询记忆 */
export async function queryMemory(providerId: string, options: MemoryQueryOptions): Promise<MemoryQueryResult> {
  const entry = capabilityProviderRegistry.find<MemoryCapabilityOptions, MemoryCapabilityResult>('memory-host', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到记忆提供者: ${providerId}`, `memory-host:${providerId}`);
  }
  const provider = entry.provider as MemoryCapabilityProvider;
  if (!provider.query) {
    // 降级：使用 invoke 查询
    const result = await provider.invoke({ operation: 'query', query: options });
    return {
      records: result.records ?? [],
      total: result.total ?? 0,
      hasMore: false,
    };
  }
  return provider.query(options);
}

/** 列出所有 Memory 提供者 */
export function listMemoryProviders() {
  return capabilityProviderRegistry.list('memory-host');
}

/** 创建 Memory 能力提供者 */
export function createMemoryProvider(
  id: string,
  invokeFn: (options: MemoryCapabilityOptions) => Promise<MemoryCapabilityResult>,
  options: {
    displayName?: string;
    description?: string;
    read?: (recordId: string) => Promise<MemoryRecord | undefined>;
    write?: (options: MemoryWriteOptions) => Promise<MemoryWriteResult>;
    delete?: (recordId: string) => Promise<boolean>;
    query?: (options: MemoryQueryOptions) => Promise<MemoryQueryResult>;
    clear?: (sessionId?: string) => Promise<number>;
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): MemoryCapabilityProvider {
  const provider: MemoryCapabilityProvider = {
    kind: 'memory-host',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.read ? { read: options.read } : {}),
    ...(options.write ? { write: options.write } : {}),
    ...(options.delete ? { delete: options.delete } : {}),
    ...(options.query ? { query: options.query } : {}),
    ...(options.clear ? { clear: options.clear } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}
