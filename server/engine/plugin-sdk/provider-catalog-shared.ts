
import { createHash } from "node:crypto";

type LiveCatalogCacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const LIVE_CATALOG_CACHE_MAX_ENTRIES = 100;
const liveCatalogCache = new Map<string, LiveCatalogCacheEntry<any>>();

function buildLiveCatalogCacheKey(parts: readonly any[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function isFutureDateTimestampMs(timestamp: number, options?: { nowMs?: number }): boolean {
  const nowMs = options?.nowMs ?? Date.now();
  return timestamp > nowMs;
}

function resolveExpiresAtMsFromDurationMs(
  durationMs: number,
  options?: { nowMs?: number },
): number | undefined {
  if (durationMs <= 0) {
    return undefined;
  }
  const nowMs = options?.nowMs ?? Date.now();
  return nowMs + durationMs;
}

export async function getCachedLiveCatalogValue<T>(params: {
  keyParts: readonly any[];
  load: () => Promise<T>;
  shouldCache?: (value: T) => boolean;
  ttlMs?: number;
  now?: () => number;
}): Promise<T> {
  const rawNow = params.now?.() ?? Date.now();
  const ttlMs = params.ttlMs ?? 30_000;
  const key = buildLiveCatalogCacheKey(params.keyParts);
  const existing = liveCatalogCache.get(key) as LiveCatalogCacheEntry<T> | undefined;
  if (existing) {
    if (isFutureDateTimestampMs(existing.expiresAt, { nowMs: rawNow })) {
      return await existing.value;
    }
    liveCatalogCache.delete(key);
  }
  const value = params.load();
  const expiresAt = resolveExpiresAtMsFromDurationMs(ttlMs, { nowMs: rawNow });
  if (expiresAt !== undefined) {
    if (liveCatalogCache.size >= LIVE_CATALOG_CACHE_MAX_ENTRIES) {
      const oldestKey = liveCatalogCache.keys().next();
      if (!oldestKey.done) {
        liveCatalogCache.delete(oldestKey.value);
      }
    }
    liveCatalogCache.set(key, {
      expiresAt,
      value,
    });
  }
  try {
    const resolved = await value;
    if (params.shouldCache && !params.shouldCache(resolved)) {
      liveCatalogCache.delete(key);
    }
    return resolved;
  } catch (err) {
    liveCatalogCache.delete(key);
    throw err;
  }
}

export function clearLiveCatalogCacheForTests(): void {
  liveCatalogCache.clear();
}

export type ConfiguredProviderCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<"text" | "image" | "audio" | "video" | "document">;
};

type ModelDefinitionConfig = {
  id: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  reasoning?: boolean;
  input?: any;
  cost?: any;
  contextWindow?: number;
  contextTokens?: number;
  maxTokens?: number;
  headers?: Record<string, any>;
  compat?: Record<string, any>;
  mediaInput?: any;
  [key: string]: any;
};

type ModelProviderConfig = {
  baseUrl?: string;
  api?: string;
  headers?: Record<string, any>;
  models?: ModelDefinitionConfig[];
  [key: string]: any;
};

export type { ModelProviderConfig, ModelDefinitionConfig };

function countRawManifestCatalogModels(catalog: any): number | undefined {
  if (!catalog || typeof catalog !== "object") {
    return undefined;
  }
  const models = (catalog as { models?: any }).models;
  return Array.isArray(models) ? models.length : undefined;
}

function normalizeConfiguredCatalogModelInput(
  input: any,
): ConfiguredProviderCatalogEntry["input"] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const normalized = input.filter(
    (item): item is "text" | "image" | "audio" | "video" | "document" =>
      item === "text" ||
      item === "image" ||
      item === "audio" ||
      item === "video" ||
      item === "document",
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeConfiguredProviderCatalogModelId(
  providerId: string,
  modelId: string,
  _options?: { allowManifestNormalization?: boolean },
): string {
  return `${providerId}/${modelId}`;
}

function findNormalizedProviderKey(
  providers: Record<string, any> | undefined,
  providerId: string,
): string | undefined {
  if (!providers) {
    return undefined;
  }
  const lowerId = providerId.toLowerCase();
  for (const key of Object.keys(providers)) {
    if (key.toLowerCase() === lowerId) {
      return key;
    }
  }
  return undefined;
}

type OpenClawConfig = {
  models?: {
    providers?: Record<string, ModelProviderConfig>;
  };
  [key: string]: any;
};

function resolveConfiguredProviderModels(
  config: OpenClawConfig | undefined,
  providerId: string,
): ModelDefinitionConfig[] {
  const providers = config?.models?.providers;
  if (!providers || typeof providers !== "object") {
    return [];
  }
  const providerKey = findNormalizedProviderKey(providers, providerId);
  if (!providerKey) {
    return [];
  }
  const providerConfig = providers[providerKey];
  if (!providerConfig || typeof providerConfig !== "object") {
    return [];
  }
  return Array.isArray(providerConfig.models) ? providerConfig.models : [];
}

export function readConfiguredProviderCatalogEntries(params: {
  config?: OpenClawConfig;
  providerId: string;
  publishedProviderId?: string;
}): ConfiguredProviderCatalogEntry[] {
  const provider = params.publishedProviderId ?? params.providerId;
  const models = resolveConfiguredProviderModels(params.config, params.providerId);
  const entries: ConfiguredProviderCatalogEntry[] = [];
  for (const model of models) {
    if (!model || typeof model !== "object") {
      continue;
    }
    const id = typeof model.id === "string" ? model.id.trim() : "";
    if (!id) {
      continue;
    }
    const normalizedId = normalizeConfiguredProviderCatalogModelId(provider, id);
    const name =
      (typeof model.name === "string" ? model.name : normalizedId).trim() || normalizedId;
    const contextWindow =
      typeof model.contextWindow === "number" && model.contextWindow > 0
        ? model.contextWindow
        : undefined;
    const reasoning = typeof model.reasoning === "boolean" ? model.reasoning : undefined;
    const input = normalizeConfiguredCatalogModelInput(model.input);
    entries.push({
      provider,
      id: normalizedId,
      name,
      ...(contextWindow ? { contextWindow } : {}),
      ...(reasoning !== undefined ? { reasoning } : {}),
      ...(input ? { input } : {}),
    });
  }
  return entries;
}

function withStreamingUsageCompat(provider: ModelProviderConfig): ModelProviderConfig {
  if (!Array.isArray(provider.models) || provider.models.length === 0) {
    return provider;
  }

  let changed = false;
  const models = provider.models.map((model) => {
    if (model.compat?.supportsUsageInStreaming !== undefined) {
      return model;
    }
    changed = true;
    return {
      ...model,
      compat: {
        ...model.compat,
        supportsUsageInStreaming: true,
      },
    };
  });

  return changed ? { ...provider, models } : provider;
}

function resolveProviderRequestCapabilities(_params: {
  provider: string;
  api: string;
  baseUrl: string | undefined;
  capability: string;
  transport: string;
}): { supportsNativeStreamingUsageCompat: boolean } {
  return { supportsNativeStreamingUsageCompat: true };
}

export function supportsNativeStreamingUsageCompat(params: {
  providerId: string;
  baseUrl: string | undefined;
}): boolean {
  return resolveProviderRequestCapabilities({
    provider: params.providerId,
    api: "openai-completions",
    baseUrl: params.baseUrl,
    capability: "llm",
    transport: "stream",
  }).supportsNativeStreamingUsageCompat;
}

export function applyProviderNativeStreamingUsageCompat(params: {
  providerId: string;
  providerConfig: ModelProviderConfig;
}): ModelProviderConfig {
  return supportsNativeStreamingUsageCompat({
    providerId: params.providerId,
    baseUrl: params.providerConfig.baseUrl,
  })
    ? withStreamingUsageCompat(params.providerConfig)
    : params.providerConfig;
}
