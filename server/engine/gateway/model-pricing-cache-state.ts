// Gateway model-pricing cache state.
// Stores normalized pricing rows and source-health failures for runtime reads.
//
// 降级说明：
//  - `@openclaw/model-catalog-core/provider-id` 的 `normalizeProviderId` 降级为
//    内联实现（去除首尾空白、转小写）。
//  - `@openclaw/normalization-core/string-coerce` 的 `normalizeLowercaseStringOrEmpty`
//    改从 `../infra/string-coerce.js` 导入。
//  - `../agents/model-selection.js` 的 `normalizeModelRef` 降级为内联实现：
//    从 "provider/model" 形式中拆分 provider 与 model。
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";

// ============================================================================
// 降级工具
// ============================================================================

/**
 * 规范化 provider id（降级实现）。
 *
 * 降级原因：openclaw `@openclaw/model-catalog-core/provider-id` 还会处理别名
 * （如 "anthropic" ↔ "claude"）。这里仅做基础小写化与空白清理。
 */
function normalizeProviderId(provider: string): string {
  if (typeof provider !== "string") {
    return "";
  }
  return provider.trim().toLowerCase();
}

/**
 * 规范化 model 引用（降级实现）。
 *
 * 降级原因：openclaw `agents/model-selection` 还会处理插件别名、provider 前缀
 * 去重等。这里仅从 "provider/model" 形式中拆分。
 */
function normalizeModelRef(
  provider: string,
  model: string,
  _options?: { allowPluginNormalization?: boolean },
): { provider: string; model: string } {
  const normalizedProvider = normalizeProviderId(provider);
  const trimmedModel = typeof model === "string" ? model.trim() : "";
  if (normalizedProvider && trimmedModel) {
    const lowerProvider = normalizeLowercaseStringOrEmpty(normalizedProvider);
    const lowerModel = normalizeLowercaseStringOrEmpty(trimmedModel);
    if (lowerModel.startsWith(`${lowerProvider}/`)) {
      const suffix = trimmedModel.slice(normalizedProvider.length + 1);
      return { provider: normalizedProvider, model: suffix };
    }
  }
  return { provider: normalizedProvider, model: trimmedModel };
}

// ============================================================================
// 主实现
// ============================================================================

export type CachedPricingTier = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** [startTokens, endTokens) — half-open interval on the input token axis. */
  range: [number, number];
};

export type CachedModelPricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Optional tiered pricing tiers sourced from LiteLLM or local config. */
  tieredPricing?: CachedPricingTier[];
};

type GatewayModelPricingHealthSource = "openrouter" | "litellm" | "bootstrap" | "refresh";

export type GatewayModelPricingHealth = {
  state: "ok" | "degraded" | "disabled";
  sources: Array<{
    source: GatewayModelPricingHealthSource;
    state: "ok" | "degraded";
    lastFailureAt?: number;
    detail?: string;
  }>;
  lastFailureAt?: number;
  detail?: string;
};

let cachedPricing = new Map<string, CachedModelPricing>();
let cachedAt = 0;
const sourceFailures = new Map<
  GatewayModelPricingHealthSource,
  { lastFailureAt: number; detail: string }
>();

function modelPricingCacheKey(provider: string, model: string): string {
  // Keys accept both provider/model and provider-prefixed model ids so external
  // catalogs can be queried without double-prefixing.
  const providerId = normalizeProviderId(provider);
  const modelId = model.trim();
  if (!providerId || !modelId) {
    return "";
  }
  return normalizeLowercaseStringOrEmpty(modelId).startsWith(
    `${normalizeLowercaseStringOrEmpty(providerId)}/`,
  )
    ? modelId
    : `${providerId}/${modelId}`;
}

export function replaceGatewayModelPricingCache(
  nextPricing: Map<string, CachedModelPricing>,
  nextCachedAt = Date.now(),
): void {
  cachedPricing = nextPricing;
  cachedAt = nextCachedAt;
}

export function clearGatewayModelPricingCacheState(): void {
  cachedPricing = new Map();
  cachedAt = 0;
  clearGatewayModelPricingFailures();
}

export function recordGatewayModelPricingSourceFailure(
  source: GatewayModelPricingHealthSource,
  detail: string,
  failedAt = Date.now(),
): void {
  sourceFailures.set(source, {
    lastFailureAt: failedAt,
    detail,
  });
}

export function clearGatewayModelPricingSourceFailure(
  source: GatewayModelPricingHealthSource,
): void {
  sourceFailures.delete(source);
}

export function clearGatewayModelPricingFailures(): void {
  sourceFailures.clear();
}

export function getGatewayModelPricingHealth(params?: {
  enabled?: boolean;
}): GatewayModelPricingHealth {
  if (params?.enabled === false) {
    return {
      state: "disabled",
      sources: [],
    };
  }
  const sources: GatewayModelPricingHealth["sources"] = Array.from(sourceFailures.entries())
    .map(([source, failure]) => ({
      source,
      state: "degraded" as const,
      lastFailureAt: failure.lastFailureAt,
      detail: failure.detail,
    }))
    .sort((left, right) => left.source.localeCompare(right.source));
  const latest = sources.reduce<(typeof sources)[number] | undefined>((current, source) => {
    if (!current || (source.lastFailureAt ?? 0) > (current.lastFailureAt ?? 0)) {
      return source;
    }
    return current;
  }, undefined);
  return {
    state: sources.length > 0 ? "degraded" : "ok",
    sources,
    ...(latest?.lastFailureAt ? { lastFailureAt: latest.lastFailureAt } : {}),
    ...(latest?.detail ? { detail: latest.detail } : {}),
  };
}

export function getCachedGatewayModelPricing(params: {
  provider?: string;
  model?: string;
}): CachedModelPricing | undefined {
  const provider = params.provider?.trim();
  const model = params.model?.trim();
  if (!provider || !model) {
    return undefined;
  }
  const key = modelPricingCacheKey(provider, model);
  const direct = key ? cachedPricing.get(key) : undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeModelRef(provider, model);
  const normalizedKey = modelPricingCacheKey(normalized.provider, normalized.model);
  if (normalizedKey === key) {
    return undefined;
  }
  return normalizedKey ? cachedPricing.get(normalizedKey) : undefined;
}

export function getGatewayModelPricingCacheMeta(): {
  cachedAt: number;
  ttlMs: number;
  size: number;
} {
  return {
    cachedAt,
    ttlMs: 0,
    size: cachedPricing.size,
  };
}

function stablePricingValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stablePricingValue(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stablePricingValue(record[key])}`)
    .join(",")}}`;
}

export function getGatewayModelPricingCacheFingerprint(): string {
  const entries = Array.from(cachedPricing.entries()).sort(([a], [b]) => a.localeCompare(b));
  return stablePricingValue(entries);
}

export function resetGatewayModelPricingCacheForTest(): void {
  clearGatewayModelPricingCacheState();
}

export function setGatewayModelPricingForTest(
  entries: Array<{ provider: string; model: string; pricing: CachedModelPricing }>,
): void {
  replaceGatewayModelPricingCache(
    new Map(
      entries.flatMap((entry) => {
        const normalized = normalizeModelRef(entry.provider, entry.model, {
          allowPluginNormalization: false,
        });
        const key = modelPricingCacheKey(normalized.provider, normalized.model);
        return key ? ([[key, entry.pricing]] as const) : [];
      }),
    ),
  );
}
