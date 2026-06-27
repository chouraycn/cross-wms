/**
 * Web Search Providers — Web 搜索 Provider 加载器
 *
 * 管理 Web 搜索 Provider 的注册、获取、排序和自动检测。
 * 简化版架构，不依赖完整的插件加载系统。
 */

import type {
  PluginWebSearchProviderEntry,
  WebSearchCredentialResolutionSource,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
} from "./web-provider-types.js";

// ==================== 内部状态 ====================

const registeredProviders: Map<string, PluginWebSearchProviderEntry[]> = new Map();

// ==================== 排序函数 ====================

function compareProvidersAlphabetically(
  a: Pick<PluginWebSearchProviderEntry, "id" | "pluginId">,
  b: Pick<PluginWebSearchProviderEntry, "id" | "pluginId">,
): number {
  return a.id.localeCompare(b.id) || a.pluginId.localeCompare(b.pluginId);
}

export function sortWebSearchProviders(
  providers: PluginWebSearchProviderEntry[],
): PluginWebSearchProviderEntry[] {
  return [...providers].sort(compareProvidersAlphabetically);
}

export function sortWebSearchProvidersForAutoDetect(
  providers: PluginWebSearchProviderEntry[],
): PluginWebSearchProviderEntry[] {
  return [...providers].sort((a, b) => {
    const aOrder = a.autoDetectOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.autoDetectOrder ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return compareProvidersAlphabetically(a, b);
  });
}

// ==================== 注册与获取 ====================

export function registerWebSearchProvider(
  pluginId: string,
  provider: WebSearchProviderPlugin,
): void {
  if (!registeredProviders.has(pluginId)) {
    registeredProviders.set(pluginId, []);
  }
  const entries = registeredProviders.get(pluginId)!;
  const existingIndex = entries.findIndex((e) => e.id === provider.id);
  const entry: PluginWebSearchProviderEntry = {
    ...provider,
    pluginId,
  };
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }
}

export function unregisterWebSearchProvider(
  pluginId: string,
  providerId?: string,
): void {
  if (!providerId) {
    registeredProviders.delete(pluginId);
    return;
  }
  const entries = registeredProviders.get(pluginId);
  if (!entries) return;
  const filtered = entries.filter((e) => e.id !== providerId);
  if (filtered.length === 0) {
    registeredProviders.delete(pluginId);
  } else {
    registeredProviders.set(pluginId, filtered);
  }
}

export function getWebSearchProviders(
  options?: {
    onlyPluginIds?: readonly string[];
  },
): PluginWebSearchProviderEntry[] {
  const onlyPluginIdSet = options?.onlyPluginIds
    ? new Set(options.onlyPluginIds)
    : undefined;

  const allEntries: PluginWebSearchProviderEntry[] = [];
  registeredProviders.forEach((entries, pluginId) => {
    if (onlyPluginIdSet && !onlyPluginIdSet.has(pluginId)) {
      return;
    }
    allEntries.push(...entries);
  });
  return sortWebSearchProviders(allEntries);
}

// ==================== 凭证解析 ====================

export interface ResolveWebSearchCredentialOptions {
  provider: WebSearchProviderPlugin;
  searchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
}

export interface ResolvedWebSearchCredential {
  value?: string;
  source: WebSearchCredentialResolutionSource;
  fallbackEnvVar?: string;
}

export function resolveWebSearchCredential(
  options: ResolveWebSearchCredentialOptions,
): ResolvedWebSearchCredential {
  const { provider, searchConfig, config, env = process.env } = options;

  if (searchConfig) {
    const configValue = provider.getCredentialValue(searchConfig);
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      return {
        value: String(configValue),
        source: "config",
      };
    }
  }

  if (provider.getConfiguredCredentialValue && config) {
    const globalConfigValue = provider.getConfiguredCredentialValue(config);
    if (globalConfigValue !== undefined && globalConfigValue !== null && globalConfigValue !== "") {
      return {
        value: String(globalConfigValue),
        source: "config",
      };
    }
  }

  for (const envVar of provider.envVars) {
    const envValue = env[envVar];
    if (envValue !== undefined && envValue !== "") {
      return {
        value: envValue,
        source: "env",
        fallbackEnvVar: envVar,
      };
    }
  }

  return {
    source: "missing",
  };
}

// ==================== 自动检测 ====================

export interface AutoDetectWebSearchProviderOptions {
  searchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
  onlyPluginIds?: readonly string[];
}

export interface AutoDetectWebSearchProviderResult {
  provider: PluginWebSearchProviderEntry | null;
  credential: ResolvedWebSearchCredential;
  allProviders: PluginWebSearchProviderEntry[];
}

export function autoDetectWebSearchProvider(
  options: AutoDetectWebSearchProviderOptions = {},
): AutoDetectWebSearchProviderResult {
  const allProviders = getWebSearchProviders({
    onlyPluginIds: options.onlyPluginIds,
  });
  const sorted = sortWebSearchProvidersForAutoDetect(allProviders);

  for (const provider of sorted) {
    const credential = resolveWebSearchCredential({
      provider,
      searchConfig: options.searchConfig,
      config: options.config,
      env: options.env,
    });
    if (credential.source !== "missing") {
      return {
        provider,
        credential,
        allProviders,
      };
    }
    if (!provider.requiresCredential) {
      return {
        provider,
        credential: { source: "missing" },
        allProviders,
      };
    }
  }

  return {
    provider: null,
    credential: { source: "missing" },
    allProviders,
  };
}

// ==================== 创建工具 ====================

export function createWebSearchTool(
  provider: PluginWebSearchProviderEntry,
  searchConfig?: Record<string, unknown>,
): WebSearchProviderToolDefinition | null {
  return provider.createTool({
    searchConfig,
  });
}
