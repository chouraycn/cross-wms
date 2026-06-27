/**
 * Web Fetch Providers — Web 抓取 Provider 加载器
 *
 * 管理 Web 抓取 Provider 的注册、获取、排序、自动检测以及回退链。
 * 简化版架构，不依赖完整的插件加载系统。
 */

import type {
  PluginWebFetchProviderEntry,
  WebFetchCredentialResolutionSource,
  WebFetchProviderPlugin,
  WebFetchProviderToolDefinition,
} from "./web-provider-types.js";

// ==================== 内部状态 ====================

const registeredProviders: Map<string, PluginWebFetchProviderEntry[]> = new Map();

// ==================== 排序函数 ====================

function compareProvidersAlphabetically(
  a: Pick<PluginWebFetchProviderEntry, "id" | "pluginId">,
  b: Pick<PluginWebFetchProviderEntry, "id" | "pluginId">,
): number {
  return a.id.localeCompare(b.id) || a.pluginId.localeCompare(b.pluginId);
}

export function sortWebFetchProviders(
  providers: PluginWebFetchProviderEntry[],
): PluginWebFetchProviderEntry[] {
  return [...providers].sort(compareProvidersAlphabetically);
}

export function sortWebFetchProvidersForAutoDetect(
  providers: PluginWebFetchProviderEntry[],
): PluginWebFetchProviderEntry[] {
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

export function registerWebFetchProvider(
  pluginId: string,
  provider: WebFetchProviderPlugin,
): void {
  if (!registeredProviders.has(pluginId)) {
    registeredProviders.set(pluginId, []);
  }
  const entries = registeredProviders.get(pluginId)!;
  const existingIndex = entries.findIndex((e) => e.id === provider.id);
  const entry: PluginWebFetchProviderEntry = {
    ...provider,
    pluginId,
  };
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }
}

export function unregisterWebFetchProvider(
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

export function getWebFetchProviders(
  options?: {
    onlyPluginIds?: readonly string[];
  },
): PluginWebFetchProviderEntry[] {
  const onlyPluginIdSet = options?.onlyPluginIds
    ? new Set(options.onlyPluginIds)
    : undefined;

  const allEntries: PluginWebFetchProviderEntry[] = [];
  registeredProviders.forEach((entries, pluginId) => {
    if (onlyPluginIdSet && !onlyPluginIdSet.has(pluginId)) {
      return;
    }
    allEntries.push(...entries);
  });
  return sortWebFetchProviders(allEntries);
}

// ==================== 凭证解析 ====================

export interface ResolveWebFetchCredentialOptions {
  provider: WebFetchProviderPlugin;
  fetchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
}

export interface ResolvedWebFetchCredential {
  value?: string;
  source: WebFetchCredentialResolutionSource;
  fallbackEnvVar?: string;
}

export function resolveWebFetchCredential(
  options: ResolveWebFetchCredentialOptions,
): ResolvedWebFetchCredential {
  const { provider, fetchConfig, config, env = process.env } = options;

  if (fetchConfig) {
    const configValue = provider.getCredentialValue(fetchConfig);
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

export interface AutoDetectWebFetchProviderOptions {
  fetchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
  onlyPluginIds?: readonly string[];
}

export interface AutoDetectWebFetchProviderResult {
  provider: PluginWebFetchProviderEntry | null;
  credential: ResolvedWebFetchCredential;
  allProviders: PluginWebFetchProviderEntry[];
}

export function autoDetectWebFetchProvider(
  options: AutoDetectWebFetchProviderOptions = {},
): AutoDetectWebFetchProviderResult {
  const allProviders = getWebFetchProviders({
    onlyPluginIds: options.onlyPluginIds,
  });
  const sorted = sortWebFetchProvidersForAutoDetect(allProviders);

  for (const provider of sorted) {
    const credential = resolveWebFetchCredential({
      provider,
      fetchConfig: options.fetchConfig,
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

// ==================== Provider 回退链 ====================

export interface WebFetchFallbackChainOptions {
  preferredProviderId?: string;
  fetchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
  onlyPluginIds?: readonly string[];
}

export function buildWebFetchFallbackChain(
  options: WebFetchFallbackChainOptions = {},
): PluginWebFetchProviderEntry[] {
  const allProviders = getWebFetchProviders({
    onlyPluginIds: options.onlyPluginIds,
  });

  if (options.preferredProviderId) {
    const preferred = allProviders.find((p) => p.id === options.preferredProviderId);
    if (preferred) {
      const others = allProviders.filter((p) => p.id !== options.preferredProviderId);
      return [preferred, ...sortWebFetchProvidersForAutoDetect(others)];
    }
  }

  return sortWebFetchProvidersForAutoDetect(allProviders);
}

export interface WebFetchFallbackExecuteOptions<T> {
  chain: PluginWebFetchProviderEntry[];
  fetchConfig?: Record<string, unknown>;
  shouldFallback?: (result: T | null, error?: Error) => boolean;
  execute: (provider: PluginWebFetchProviderEntry, tool: WebFetchProviderToolDefinition) => Promise<T | null>;
}

export async function executeWithWebFetchFallback<T>(
  options: WebFetchFallbackExecuteOptions<T>,
): Promise<{ result: T | null; providerUsed: string | null; errors: Array<{ providerId: string; error: string }> }> {
  const { chain, fetchConfig, shouldFallback, execute } = options;
  const errors: Array<{ providerId: string; error: string }> = [];

  for (const provider of chain) {
    try {
      const tool = provider.createTool({
        fetchConfig,
      });
      if (!tool) {
        errors.push({ providerId: provider.id, error: "Provider tool creation returned null" });
        continue;
      }

      const result = await execute(provider, tool);

      if (shouldFallback) {
        if (!shouldFallback(result)) {
          return { result, providerUsed: provider.id, errors };
        }
      } else if (result !== null) {
        return { result, providerUsed: provider.id, errors };
      }

      errors.push({ providerId: provider.id, error: "Result was null or fallback condition met" });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push({ providerId: provider.id, error: errorMsg });
    }
  }

  return { result: null, providerUsed: null, errors };
}

// ==================== 创建工具 ====================

export function createWebFetchTool(
  provider: PluginWebFetchProviderEntry,
  fetchConfig?: Record<string, unknown>,
): WebFetchProviderToolDefinition | null {
  return provider.createTool({
    fetchConfig,
  });
}
