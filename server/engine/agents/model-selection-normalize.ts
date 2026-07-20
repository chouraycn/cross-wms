/**
 * 移植自 openclaw/src/agents/model-selection-normalize.ts
 *
 * Normalizes provider/model references and configured model ids.
 * Simplified for cross-wms: inlines provider normalization instead of
 * depending on @openclaw/model-catalog-core.
 */

export type ModelRef = {
  provider: string;
  model: string;
};

export type ModelManifestNormalizationContext = {
  manifestPlugins?: readonly Record<string, unknown>[];
};

// Inlined provider normalization – mirrors normalizeProviderId from catalog-core.
const PROVIDER_ALIASES: Record<string, string> = {
  "openai.com": "openai",
  "anthropic.com": "anthropic",
  "google.com": "google",
  "xai.com": "xai",
  "mistral.ai": "mistral",
};

function normalizeProviderIdCore(provider: string): string {
  const trimmed = provider.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return PROVIDER_ALIASES[trimmed] ?? trimmed;
}

/** Build the canonical provider/model key for model selection. */
export function modelKey(provider: string, model: string): string {
  const providerId = normalizeProviderIdCore(provider);
  const modelId = model.trim();
  if (!providerId || !modelId) {
    return "";
  }
  return `${providerId}/${modelId}`;
}

/** Return the legacy raw key when it differs from the canonical key. */
export function legacyModelKey(provider: string, model: string): string | null {
  const providerId = provider.trim();
  const modelId = model.trim();
  if (!providerId || !modelId) {
    return null;
  }
  const rawKey = `${providerId}/${modelId}`;
  const canonicalKey = modelKey(providerId, modelId);
  return rawKey === canonicalKey ? null : rawKey;
}

/** Normalize a provider ID using the shared catalog rules. */
export function normalizeProviderId(provider: string): string {
  return normalizeProviderIdCore(provider);
}

/** Normalize a provider ID for auth lookup. */
export function normalizeProviderIdForAuth(provider: string): string {
  return normalizeProviderIdCore(provider);
}

/** Find a provider value by normalized provider ID. */
export function findNormalizedProviderValue<T>(
  entries: Record<string, T> | undefined,
  provider: string,
): T | undefined {
  if (!entries) {
    return undefined;
  }
  const normalized = normalizeProviderIdCore(provider);
  for (const [key, value] of Object.entries(entries)) {
    if (normalizeProviderIdCore(key) === normalized) {
      return value;
    }
  }
  return undefined;
}

/** Find the original provider key matching a normalized provider ID. */
export function findNormalizedProviderKey(
  entries: Record<string, unknown> | undefined,
  provider: string,
): string | undefined {
  if (!entries) {
    return undefined;
  }
  const normalized = normalizeProviderIdCore(provider);
  for (const key of Object.keys(entries)) {
    if (normalizeProviderIdCore(key) === normalized) {
      return key;
    }
  }
  return undefined;
}

/** Normalize a provider/model pair into a canonical model reference. */
export function normalizeModelRef(
  provider: string,
  model: string,
  _options?: ModelManifestNormalizationContext & {
    allowManifestNormalization?: boolean;
    allowPluginNormalization?: boolean;
  },
): ModelRef {
  const normalizedProvider = normalizeProviderIdCore(provider);
  const normalizedModel = model.trim();
  return { provider: normalizedProvider, model: normalizedModel };
}

const OPENROUTER_AUTO_COMPAT_ALIAS = "openrouter:auto";

/** Parse `provider/model` or bare model text using a default provider. */
export function parseModelRef(
  raw: string,
  defaultProvider: string,
  options?: ModelManifestNormalizationContext & {
    allowManifestNormalization?: boolean;
    allowPluginNormalization?: boolean;
  },
): ModelRef | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === OPENROUTER_AUTO_COMPAT_ALIAS) {
    return normalizeModelRef("openrouter", "auto", options);
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return normalizeModelRef(defaultProvider, trimmed, options);
  }
  const providerRaw = trimmed.slice(0, slash).trim();
  const model = trimmed.slice(slash + 1).trim();
  if (!providerRaw || !model) {
    return null;
  }
  return normalizeModelRef(providerRaw, model, options);
}
