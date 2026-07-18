/**
 * Provider 注册表 — 注册、查找、列举与默认 Provider 管理。
 *
 * 参考 openclaw/src/tts/provider-registry-core.ts 的 createSpeechProviderRegistry
 * 设计：通过工厂创建注册表门面，支持 ID 归一化、别名解析与规范化。
 * 本模块去掉插件能力运行时耦合，改为显式注册。
 */

import type { TTSProviderPlugin } from './types.js';

/** 将输入 ID 归一化为小写 trimmed 字符串，空值返回 undefined。 */
export function normalizeProviderId(id: string | undefined | null): string | undefined {
  if (!id) return undefined;
  const normalized = id.trim().toLowerCase();
  return normalized || undefined;
}

/** Provider 注册表门面。 */
export interface ProviderRegistry {
  /** 注册一个 Provider 插件。 */
  register(plugin: TTSProviderPlugin): void;
  /** 注销 Provider。 */
  unregister(id: string): boolean;
  /** 按 ID 或别名查找 Provider。 */
  get(id: string | undefined): TTSProviderPlugin | undefined;
  /** 判断是否已注册（含别名）。 */
  has(id: string | undefined): boolean;
  /** 将别名/ID 规范化为 Provider 的 canonical ID。 */
  canonicalize(id: string | undefined): string | undefined;
  /** 列举全部已注册 Provider。 */
  list(): TTSProviderPlugin[];
  /** 设置默认 Provider。 */
  setDefault(id: string): void;
  /** 获取默认 Provider。 */
  getDefault(): TTSProviderPlugin | undefined;
}

/** 创建一个独立的 Provider 注册表。 */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, TTSProviderPlugin>();
  const aliasToId = new Map<string, string>();
  let defaultId: string | undefined;

  function resolveId(id: string | undefined): string | undefined {
    const normalized = normalizeProviderId(id);
    if (!normalized) return undefined;
    if (providers.has(normalized)) return normalized;
    return aliasToId.get(normalized);
  }

  return {
    register(plugin) {
      const id = normalizeProviderId(plugin.id);
      if (!id) throw new Error('Provider id must be a non-empty string');
      providers.set(id, plugin);
      if (plugin.aliases) {
        for (const alias of plugin.aliases) {
          const normalizedAlias = normalizeProviderId(alias);
          if (normalizedAlias && normalizedAlias !== id) {
            aliasToId.set(normalizedAlias, id);
          }
        }
      }
      if (!defaultId) defaultId = id;
    },

    unregister(id) {
      const resolved = resolveId(id);
      if (!resolved) return false;
      const plugin = providers.get(resolved);
      if (plugin?.aliases) {
        for (const alias of plugin.aliases) {
          const normalizedAlias = normalizeProviderId(alias);
          if (normalizedAlias) aliasToId.delete(normalizedAlias);
        }
      }
      providers.delete(resolved);
      if (defaultId === resolved) {
        defaultId = providers.keys().next().value;
      }
      return true;
    },

    get(id) {
      const resolved = resolveId(id);
      if (!resolved) return undefined;
      return providers.get(resolved);
    },

    has(id) {
      return resolveId(id) !== undefined;
    },

    canonicalize(id) {
      const resolved = resolveId(id);
      return resolved ?? normalizeProviderId(id);
    },

    list() {
      return Array.from(providers.values());
    },

    setDefault(id) {
      const resolved = resolveId(id);
      if (!resolved) {
        throw new Error(`Cannot set default: provider "${id}" not registered`);
      }
      defaultId = resolved;
    },

    getDefault() {
      if (!defaultId) return undefined;
      return providers.get(defaultId);
    },
  };
}

/** 进程级默认注册表，由 index.ts 注册内置 Provider。 */
export const providerRegistry: ProviderRegistry = createProviderRegistry();
