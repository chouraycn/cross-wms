/**
 * Plugin SDK 能力提供者 — 基础接口与注册表
 *
 * 参考 openclaw/src/plugins/capability-provider-runtime.ts 的分层方式：
 * - 定义统一的 CapabilityProvider 接口
 * - 提供注册表用于发现与调用能力提供者
 * - 各具体能力（LLM/Tool/Channel/Memory/Search/Media/Embedding/Skill）实现此接口
 */

import { logger } from '../../logger.js';
import type { PluginCapabilityKind } from './types.js';
import { PluginCapabilityError, toPluginSdkError } from './plugin-errors.js';

// ===================== 能力提供者接口 =====================

/** 能力提供者基础接口 */
export interface CapabilityProvider<TOptions = unknown, TResult = unknown> {
  /** 能力种类 */
  readonly kind: PluginCapabilityKind;
  /** 提供者 ID（在 kind 范围内唯一） */
  readonly id: string;
  /** 显示名 */
  readonly displayName?: string;
  /** 描述 */
  readonly description?: string;
  /** 调用能力 */
  invoke(options: TOptions): Promise<TResult>;
  /** 健康检查（可选） */
  healthCheck?(): Promise<{ ok: boolean; error?: string }>;
}

/** 能力提供者注册项 */
export interface CapabilityProviderEntry<TOptions = unknown, TResult = unknown> {
  /** 提供者 */
  provider: CapabilityProvider<TOptions, TResult>;
  /** 注册的插件 ID */
  pluginId: string;
  /** 注册时间 */
  registeredAt: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ===================== 能力提供者注册表 =====================

/** 按 kind → providerId 索引的注册表 */
class CapabilityProviderRegistry {
  private providers = new Map<PluginCapabilityKind, Map<string, CapabilityProviderEntry>>();

  /** 注册能力提供者 */
  register<TOptions, TResult>(
    pluginId: string,
    provider: CapabilityProvider<TOptions, TResult>,
    metadata?: Record<string, unknown>,
  ): void {
    let kindMap = this.providers.get(provider.kind);
    if (!kindMap) {
      kindMap = new Map();
      this.providers.set(provider.kind, kindMap);
    }

    const entry: CapabilityProviderEntry = {
      provider: provider as CapabilityProvider,
      pluginId,
      registeredAt: Date.now(),
      metadata,
    };
    kindMap.set(provider.id, entry);
    logger.debug(`[CapabilityRegistry] 注册 ${provider.kind}/${provider.id} (plugin=${pluginId})`);
  }

  /** 注销能力提供者 */
  unregister(kind: PluginCapabilityKind, providerId: string): boolean {
    const kindMap = this.providers.get(kind);
    if (!kindMap) return false;
    const removed = kindMap.delete(providerId);
    if (removed) {
      logger.debug(`[CapabilityRegistry] 注销 ${kind}/${providerId}`);
    }
    return removed;
  }

  /** 注销插件的所有能力提供者 */
  unregisterByPlugin(pluginId: string): number {
    let count = 0;
    for (const kindMap of this.providers.values()) {
      for (const [providerId, entry] of kindMap) {
        if (entry.pluginId === pluginId) {
          kindMap.delete(providerId);
          count++;
        }
      }
    }
    if (count > 0) {
      logger.debug(`[CapabilityRegistry] 注销插件 ${pluginId} 的 ${count} 个能力提供者`);
    }
    return count;
  }

  /** 查找能力提供者 */
  find<TOptions, TResult>(
    kind: PluginCapabilityKind,
    providerId: string,
  ): CapabilityProviderEntry<TOptions, TResult> | undefined {
    const kindMap = this.providers.get(kind);
    if (!kindMap) return undefined;
    return kindMap.get(providerId) as CapabilityProviderEntry<TOptions, TResult> | undefined;
  }

  /** 列出某能力的所有提供者 */
  list(kind: PluginCapabilityKind): CapabilityProviderEntry[] {
    const kindMap = this.providers.get(kind);
    if (!kindMap) return [];
    return Array.from(kindMap.values());
  }

  /** 列出所有能力提供者 */
  listAll(): Array<{ kind: PluginCapabilityKind; entries: CapabilityProviderEntry[] }> {
    const result: Array<{ kind: PluginCapabilityKind; entries: CapabilityProviderEntry[] }> = [];
    for (const [kind, kindMap] of this.providers) {
      result.push({ kind, entries: Array.from(kindMap.values()) });
    }
    return result;
  }

  /** 清空所有能力提供者 */
  clear(): void {
    this.providers.clear();
  }
}

/** 全局能力提供者注册表 */
export const capabilityProviderRegistry = new CapabilityProviderRegistry();

// ===================== 调用工具 =====================

/** 调用能力提供者（带错误处理） */
export async function invokeCapability<TOptions, TResult>(
  kind: PluginCapabilityKind,
  providerId: string,
  options: TOptions,
): Promise<TResult> {
  const entry = capabilityProviderRegistry.find<TOptions, TResult>(kind, providerId);
  if (!entry) {
    throw new PluginCapabilityError(
      `未找到能力提供者: ${kind}/${providerId}`,
      `${kind}:${providerId}`,
    );
  }

  try {
    return await entry.provider.invoke(options);
  } catch (err) {
    throw toPluginSdkError(err, entry.pluginId);
  }
}

/** 健康检查所有能力提供者 */
export async function healthCheckAllCapabilities(): Promise<Array<{
  kind: PluginCapabilityKind;
  providerId: string;
  ok: boolean;
  error?: string;
}>> {
  const results: Array<{ kind: PluginCapabilityKind; providerId: string; ok: boolean; error?: string }> = [];
  for (const { kind, entries } of capabilityProviderRegistry.listAll()) {
    for (const entry of entries) {
      if (entry.provider.healthCheck) {
        try {
          const result = await entry.provider.healthCheck();
          results.push({
            kind,
            providerId: entry.provider.id,
            ok: result.ok,
            error: result.error,
          });
        } catch (err) {
          results.push({
            kind,
            providerId: entry.provider.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        results.push({
          kind,
          providerId: entry.provider.id,
          ok: true,
        });
      }
    }
  }
  return results;
}

/** 创建能力提供者工厂 */
export function createCapabilityProvider<TOptions, TResult>(
  kind: PluginCapabilityKind,
  id: string,
  invokeFn: (options: TOptions) => Promise<TResult>,
  options: { displayName?: string; description?: string; healthCheck?: () => Promise<{ ok: boolean; error?: string }> } = {},
): CapabilityProvider<TOptions, TResult> {
  return {
    kind,
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
}
