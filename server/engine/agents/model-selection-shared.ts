/**
 * 移植自 openclaw/src/agents/model-selection-shared.ts
 *
 * Shared model-selection resolution, alias, allowlist, and visibility logic.
 * Simplified for cross-wms: config-dependent logic uses simplified cfg types;
 * plugin/manifest normalization is omitted.
 */

import {
  type ModelManifestNormalizationContext,
  type ModelRef,
  modelKey,
  normalizeModelRef,
  normalizeProviderId,
  parseModelRef,
} from "./model-selection-normalize.js";

// --- Utility helpers (inlined from @openclaw/normalization-core) ---

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

// --- Simplified config type ---

type SimplifiedConfig = {
  agents?: {
    defaults?: {
      model?: unknown;
      models?: Record<string, unknown>;
      imageModel?: unknown;
    };
  };
  models?: {
    providers?: Record<string, unknown>;
  };
  hooks?: {
    gmail?: {
      model?: string;
    };
  };
};

// --- Model catalog types ---

type ModelCatalogEntry = {
  provider: string;
  id: string;
  name: string;
  api?: string;
  contextWindow?: number;
  contextTokens?: number;
  reasoning?: boolean;
  input?: string[];
  alias?: string;
  params?: Record<string, unknown>;
  compat?: Record<string, unknown>;
};

// --- Exported types ---

export type ModelAliasIndex = {
  byAlias: Map<string, { alias: string; ref: ModelRef }>;
  byKey: Map<string, string[]>;
};

export type ModelRefStatus = {
  key: string;
  inCatalog: boolean;
  allowAny: boolean;
  allowed: boolean;
};

export type ResolveAllowedModelRefResult =
  | { ref: ModelRef; key: string }
  | { error: string };

export type ModelVisibilityPolicy = {
  allowAny: boolean;
  allowedCatalog: ModelCatalogEntry[];
  allowedKeys: Set<string>;
  exactModelRefs: readonly string[];
  providerWildcards: ReadonlySet<string>;
  hasConfiguredEntries: boolean;
  hasProviderWildcards: boolean;
  allowsKey: (key: string) => boolean;
  allows: (ref: { provider: string; model: string }) => boolean;
  resolveSelection: (ref: { provider: string; model: string }) => ModelRef | null;
  visibleCatalog: (params: {
    catalog: readonly ModelCatalogEntry[];
    defaultVisibleCatalog: readonly ModelCatalogEntry[];
    view?: "default" | "configured" | "all";
  }) => ModelCatalogEntry[];
};

// --- Default provider ---

const DEFAULT_PROVIDER = "openai";

// --- Core functions ---

/** Infer a unique provider for a bare model from configured model rows. */
export function inferUniqueProviderFromConfiguredModels(params: {
  cfg: SimplifiedConfig;
  model: string;
  allowManifestNormalization?: boolean;
  manifestPlugins?: unknown;
}): string | undefined {
  const model = params.model.trim();
  if (!model) {
    return undefined;
  }
  const normalized = normalizeLowercaseStringOrEmpty(model);
  const providers = new Set<string>();
  const configuredModels = params.cfg.agents?.defaults?.models;
  if (configuredModels) {
    for (const key of Object.keys(configuredModels)) {
      const ref = key.trim();
      if (!ref || !ref.includes("/") || ref.endsWith("/*")) {
        continue;
      }
      const parsed = parseModelRef(ref, DEFAULT_PROVIDER);
      if (!parsed) {
        continue;
      }
      if (parsed.model === model || normalizeLowercaseStringOrEmpty(parsed.model) === normalized) {
        providers.add(parsed.provider);
        if (providers.size > 1) {
          return undefined;
        }
      }
    }
  }
  const configuredProviders = params.cfg.models?.providers;
  if (configuredProviders) {
    for (const [providerId, providerConfig] of Object.entries(configuredProviders)) {
      const models = (providerConfig as Record<string, unknown>)?.models;
      if (!Array.isArray(models)) {
        continue;
      }
      for (const entry of models) {
        const modelId = (entry as Record<string, unknown>)?.id;
        if (typeof modelId !== "string") {
          continue;
        }
        const trimmed = modelId.trim();
        if (!trimmed) {
          continue;
        }
        if (trimmed === model || normalizeLowercaseStringOrEmpty(trimmed) === normalized) {
          providers.add(normalizeProviderId(providerId));
        }
      }
      if (providers.size > 1) {
        return undefined;
      }
    }
  }
  if (providers.size !== 1) {
    return undefined;
  }
  return providers.values().next().value;
}

/** Infer a unique provider for a bare model from a provider catalog. */
export function inferUniqueProviderFromCatalog(params: {
  catalog: readonly ModelCatalogEntry[];
  model: string;
}): string | undefined {
  const model = params.model.trim();
  if (!model) {
    return undefined;
  }
  const normalized = normalizeLowercaseStringOrEmpty(model);
  const providers = new Set<string>();
  for (const entry of params.catalog) {
    const entryId = entry.id.trim();
    if (!entryId) {
      continue;
    }
    if (entryId !== model && normalizeLowercaseStringOrEmpty(entryId) !== normalized) {
      continue;
    }
    const provider = normalizeProviderId(entry.provider);
    if (provider) {
      providers.add(provider);
    }
    if (providers.size > 1) {
      return undefined;
    }
  }
  return providers.size === 1 ? providers.values().next().value : undefined;
}

/** Resolve the provider used when a model string omits provider/id syntax. */
export function resolveBareModelDefaultProvider(params: {
  cfg: SimplifiedConfig;
  catalog: readonly ModelCatalogEntry[];
  model: string;
  defaultProvider: string;
  manifestPlugins?: unknown;
}): string {
  return (
    inferUniqueProviderFromConfiguredModels({
      cfg: params.cfg,
      model: params.model,
    }) ??
    inferUniqueProviderFromCatalog({ catalog: params.catalog, model: params.model }) ??
    params.defaultProvider
  );
}

/** Resolve OpenRouter compatibility aliases such as openrouter:auto/free. */
export function resolveConfiguredOpenRouterCompatAlias(params: {
  cfg?: SimplifiedConfig;
  raw: string;
  defaultProvider: string;
  manifestPlugins?: unknown;
}): ModelRef | null {
  const normalized = normalizeLowercaseStringOrEmpty(params.raw);
  if (normalized === "openrouter:auto") {
    return normalizeModelRef("openrouter", "auto");
  }
  if (normalized === "openrouter:free") {
    return normalizeModelRef("openrouter", "free");
  }
  return null;
}

/** Normalize a configured allowlist entry into the canonical provider/model key. */
export function resolveAllowlistModelKey(params: {
  cfg?: SimplifiedConfig;
  raw: string;
  defaultProvider: string;
  manifestPlugins?: unknown;
}): string | null {
  const parsed = parseModelRef(params.raw, params.defaultProvider);
  if (!parsed) {
    return null;
  }
  return modelKey(parsed.provider, parsed.model);
}

/** Build the exact configured model keys that constrain model visibility. */
export function buildConfiguredAllowlistKeys(params: {
  cfg: SimplifiedConfig | undefined;
  defaultProvider: string;
  manifestPlugins?: unknown;
}): Set<string> | null {
  const visibility = parseConfiguredModelVisibilityEntries({ cfg: params.cfg });
  if (visibility.exactModelRefs.length === 0) {
    return null;
  }
  const keys = new Set<string>();
  for (const raw of visibility.exactModelRefs) {
    const key = resolveAllowlistModelKey({
      cfg: params.cfg,
      raw,
      defaultProvider: params.defaultProvider,
    });
    if (key) {
      keys.add(key);
    }
  }
  return keys.size > 0 ? keys : null;
}

/** Build lookup maps from user-facing aliases to normalized model refs. */
export function buildModelAliasIndex(params: {
  cfg: SimplifiedConfig;
  defaultProvider: string;
  manifestPlugins?: unknown;
}): ModelAliasIndex {
  const byAlias = new Map<string, { alias: string; ref: ModelRef }>();
  const byKey = new Map<string, string[]>();
  const configuredModels = params.cfg.agents?.defaults?.models ?? {};
  for (const [keyRaw, entryRaw] of Object.entries(configuredModels)) {
    if (keyRaw.trim().endsWith("/*")) {
      continue;
    }
    const alias = ((entryRaw as Record<string, unknown>)?.alias as string)?.trim() ?? "";
    if (!alias) {
      continue;
    }
    const parsed = parseModelRef(keyRaw, params.defaultProvider);
    if (!parsed) {
      continue;
    }
    const aliasKey = normalizeLowercaseStringOrEmpty(alias);
    byAlias.set(aliasKey, { alias, ref: parsed });
    const key = modelKey(parsed.provider, parsed.model);
    const existing = byKey.get(key) ?? [];
    existing.push(alias);
    byKey.set(key, existing);
  }
  return { byAlias, byKey };
}

/** Resolve a model string to a ModelRef, checking aliases first. */
export function resolveModelRefFromString(params: {
  cfg?: SimplifiedConfig;
  raw: string;
  defaultProvider: string;
  aliasIndex?: ModelAliasIndex;
  manifestPlugins?: unknown;
}): { ref: ModelRef; alias?: string } | null {
  const model = params.raw.trim();
  if (!model) {
    return null;
  }
  const aliasKey = normalizeLowercaseStringOrEmpty(model);
  const aliasMatch = params.aliasIndex?.byAlias.get(aliasKey);
  if (aliasMatch) {
    return { ref: aliasMatch.ref, alias: aliasMatch.alias };
  }
  const parsed = parseModelRef(model, params.defaultProvider);
  if (!parsed) {
    return null;
  }
  return { ref: parsed };
}

/** Resolve the default configured model ref, including aliases and fallback provider rows. */
export function resolveConfiguredModelRef(params: {
  cfg: SimplifiedConfig;
  defaultProvider: string;
  defaultModel: string;
  manifestPlugins?: unknown;
}): ModelRef {
  const rawModel = resolvePrimaryModelValue(params.cfg.agents?.defaults?.model) ?? "";
  if (rawModel) {
    const trimmed = rawModel.trim();
    const parsed = parseModelRef(trimmed, params.defaultProvider);
    if (parsed) {
      return parsed;
    }
  }
  return { provider: params.defaultProvider, model: params.defaultModel };
}

function resolvePrimaryModelValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const primary = (value as Record<string, unknown>).primary;
  if (typeof primary === "string" && primary.trim()) {
    return primary.trim();
  }
  return undefined;
}

/** Build allowed model keys/catalog entries after provider wildcards and fallbacks. */
export function buildAllowedModelSetWithFallbacks(params: {
  cfg: SimplifiedConfig;
  catalog: ModelCatalogEntry[];
  defaultProvider: string;
  defaultModel?: string;
  fallbackModels: readonly string[];
  manifestPlugins?: unknown;
}): {
  allowAny: boolean;
  allowedCatalog: ModelCatalogEntry[];
  allowedKeys: Set<string>;
} {
  const visibility = parseConfiguredModelVisibilityEntries({ cfg: params.cfg });
  const allowAny = !visibility.hasEntries;
  const catalogKeys = new Set<string>();
  for (const entry of params.catalog) {
    catalogKeys.add(modelKey(entry.provider, entry.id));
  }
  if (allowAny) {
    return {
      allowAny: true,
      allowedCatalog: [...params.catalog],
      allowedKeys: catalogKeys,
    };
  }

  const allowedKeys = new Set<string>();
  for (const provider of visibility.providerWildcards) {
    allowedKeys.add(providerWildcardModelKey(provider));
  }
  for (const entry of params.catalog) {
    if (visibility.providerWildcards.has(normalizeProviderId(entry.provider))) {
      allowedKeys.add(modelKey(entry.provider, entry.id));
    }
  }
  for (const raw of visibility.exactModelRefs) {
    const parsed = parseModelRef(raw, params.defaultProvider);
    if (parsed) {
      allowedKeys.add(modelKey(parsed.provider, parsed.model));
    }
  }
  for (const fallback of params.fallbackModels) {
    const parsed = parseModelRef(fallback, params.defaultProvider);
    if (parsed) {
      allowedKeys.add(modelKey(parsed.provider, parsed.model));
    }
  }

  const allowedCatalog = params.catalog.filter((entry) =>
    allowedKeys.has(modelKey(entry.provider, entry.id)),
  );

  if (allowedCatalog.length === 0 && allowedKeys.size === 0 && visibility.providerWildcards.size === 0) {
    return {
      allowAny: true,
      allowedCatalog: [...params.catalog],
      allowedKeys: catalogKeys,
    };
  }

  return { allowAny: false, allowedCatalog, allowedKeys };
}

/** Status of a candidate model against catalog and configured allowlist state. */
export function getModelRefStatusWithFallbackModels(params: {
  cfg: SimplifiedConfig;
  catalog: ModelCatalogEntry[];
  ref: ModelRef;
  defaultProvider: string;
  defaultModel?: string;
  fallbackModels: readonly string[];
  manifestPlugins?: unknown;
}): ModelRefStatus {
  const allowed = buildAllowedModelSetWithFallbacks({
    cfg: params.cfg,
    catalog: params.catalog,
    defaultProvider: params.defaultProvider,
    defaultModel: params.defaultModel,
    fallbackModels: params.fallbackModels,
  });
  const key = modelKey(params.ref.provider, params.ref.model);
  return {
    key,
    inCatalog: params.catalog.some(
      (entry) => modelKey(entry.provider, entry.id) === key,
    ),
    allowAny: allowed.allowAny,
    allowed: allowed.allowAny || allowed.allowedKeys.has(key),
  };
}

/** Resolve a requested model string only if it is allowed by the supplied status check. */
export function resolveAllowedModelRefFromAliasIndex(params: {
  cfg: SimplifiedConfig;
  raw: string;
  defaultProvider: string;
  aliasIndex: ModelAliasIndex;
  getStatus: (ref: ModelRef) => ModelRefStatus;
  manifestPlugins?: unknown;
}): ResolveAllowedModelRefResult {
  const trimmed = params.raw.trim();
  if (!trimmed) {
    return { error: "invalid model: empty" };
  }
  const resolved = resolveModelRefFromString({
    cfg: params.cfg,
    raw: trimmed,
    defaultProvider: params.defaultProvider,
    aliasIndex: params.aliasIndex,
  });
  if (!resolved) {
    return { error: `invalid model: ${trimmed}` };
  }
  const status = params.getStatus(resolved.ref);
  if (!status.allowed) {
    return { error: `model not allowed: ${status.key}` };
  }
  return { ref: resolved.ref, key: status.key };
}

/** True when config contains provider model rows that should seed catalogs. */
export function hasConfiguredProviderModelRows(cfg: SimplifiedConfig): boolean {
  const providers = cfg.models?.providers;
  if (!providers || typeof providers !== "object") {
    return false;
  }
  return Object.values(providers).some((provider) =>
    Array.isArray((provider as Record<string, unknown>)?.models),
  );
}

/** Build catalog entries from configured provider model rows. */
export function buildConfiguredModelCatalog(params: {
  cfg: SimplifiedConfig;
  workspaceDir?: string;
  manifestPlugins?: unknown;
}): ModelCatalogEntry[] {
  const providers = params.cfg.models?.providers;
  if (!providers || typeof providers !== "object") {
    return [];
  }
  const catalog: ModelCatalogEntry[] = [];
  for (const [providerRaw, provider] of Object.entries(providers)) {
    const providerId = normalizeProviderId(providerRaw);
    if (!providerId) {
      continue;
    }
    const models = (provider as Record<string, unknown>)?.models;
    if (!Array.isArray(models)) {
      continue;
    }
    for (const model of models) {
      const entry = model as Record<string, unknown>;
      const rawId = typeof entry?.id === "string" ? entry.id.trim() : "";
      if (!rawId) {
        continue;
      }
      const name = typeof entry?.name === "string" ? entry.name.trim() : rawId;
      const contextWindow =
        typeof entry?.contextWindow === "number" && entry.contextWindow > 0
          ? entry.contextWindow
          : undefined;
      const contextTokens =
        typeof entry?.contextTokens === "number" && entry.contextTokens > 0
          ? entry.contextTokens
          : undefined;
      const reasoning = typeof entry?.reasoning === "boolean" ? entry.reasoning : undefined;
      catalog.push({
        provider: providerId,
        id: rawId,
        name,
        api: (entry?.api as string) ?? ((provider as Record<string, unknown>)?.api as string),
        contextWindow,
        contextTokens,
        reasoning,
      });
    }
  }
  return catalog;
}

/** Resolve the model for hooks.gmail configuration. */
export function resolveHooksGmailModel(params: {
  cfg: SimplifiedConfig;
  defaultProvider: string;
  manifestPlugins?: unknown;
}): ModelRef | null {
  const hooksModel = params.cfg.hooks?.gmail?.model?.trim();
  if (!hooksModel) {
    return null;
  }
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: params.defaultProvider,
  });
  const resolved = resolveModelRefFromString({
    cfg: params.cfg,
    raw: hooksModel,
    defaultProvider: params.defaultProvider,
    aliasIndex,
  });
  return resolved?.ref ?? null;
}

/** Normalize a model selection value. */
export function normalizeModelSelection(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const primary = (value as Record<string, unknown>).primary;
  if (typeof primary === "string" && primary.trim()) {
    return primary.trim();
  }
  return undefined;
}

/** Parse configured model visibility entries from config. */
export function parseConfiguredModelVisibilityEntries(params: { cfg?: SimplifiedConfig }): {
  exactModelRefs: string[];
  providerWildcards: Set<string>;
  hasEntries: boolean;
} {
  const rawModels = Object.keys(params.cfg?.agents?.defaults?.models ?? {});
  const exactModelRefs: string[] = [];
  const providerWildcards = new Set<string>();

  for (const raw of rawModels) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.endsWith("/*")) {
      const provider = normalizeProviderId(trimmed.slice(0, -2));
      if (provider) {
        providerWildcards.add(provider);
      }
      continue;
    }
    exactModelRefs.push(raw);
  }

  return {
    exactModelRefs,
    providerWildcards,
    hasEntries: rawModels.length > 0,
  };
}

/** Build a provider wildcard model key. */
export function providerWildcardModelKey(provider: string): string {
  return modelKey(normalizeProviderId(provider), "*");
}

/** Check if a model key is allowed by the set, considering provider wildcards. */
export function isModelKeyAllowedBySet(allowedKeys: ReadonlySet<string>, key: string): boolean {
  if (allowedKeys.has(key)) {
    return true;
  }
  const separator = key.indexOf("/");
  if (separator <= 0) {
    return false;
  }
  return allowedKeys.has(providerWildcardModelKey(key.slice(0, separator)));
}

/** Resolve the allowed model selection based on visibility policy. */
export function resolveAllowedModelSelection(params: {
  cfg?: SimplifiedConfig;
  provider: string;
  model: string;
  allowAny: boolean;
  allowedKeys: ReadonlySet<string>;
  allowedCatalog: readonly ModelCatalogEntry[];
  manifestPlugins?: unknown;
}): ModelRef | null {
  const current = normalizeModelRef(params.provider, params.model);
  if (
    params.allowAny ||
    isModelKeyAllowedBySet(params.allowedKeys, modelKey(current.provider, current.model))
  ) {
    return current;
  }
  const fallback = params.allowedCatalog[0];
  if (!fallback) {
    return null;
  }
  return normalizeModelRef(fallback.provider, fallback.id);
}

/** Remove duplicate catalog entries by provider/id. */
export function dedupeModelCatalogEntries(
  entries: readonly ModelCatalogEntry[],
): ModelCatalogEntry[] {
  const seen = new Set<string>();
  const next: ModelCatalogEntry[] = [];
  for (const entry of entries) {
    const key = modelKey(entry.provider, entry.id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(entry);
  }
  return next;
}

/** Create a model visibility policy with fallbacks. */
export function createModelVisibilityPolicyWithFallbacks(params: {
  cfg: SimplifiedConfig;
  catalog: ModelCatalogEntry[];
  defaultProvider: string;
  defaultModel?: string;
  fallbackModels: readonly string[];
  manifestPlugins?: unknown;
}): ModelVisibilityPolicy {
  const visibility = parseConfiguredModelVisibilityEntries({ cfg: params.cfg });
  const allowed = buildAllowedModelSetWithFallbacks(params);
  const allowsKey = (key: string): boolean =>
    allowed.allowAny || isModelKeyAllowedBySet(allowed.allowedKeys, key);

  const policy: ModelVisibilityPolicy = {
    allowAny: allowed.allowAny,
    allowedCatalog: allowed.allowedCatalog,
    allowedKeys: allowed.allowedKeys,
    exactModelRefs: visibility.exactModelRefs,
    providerWildcards: visibility.providerWildcards,
    hasConfiguredEntries: visibility.hasEntries,
    hasProviderWildcards: visibility.providerWildcards.size > 0,
    allowsKey,
    allows: (ref) => allowsKey(modelKey(ref.provider, ref.model)),
    resolveSelection: (ref) =>
      resolveAllowedModelSelection({
        provider: ref.provider,
        model: ref.model,
        cfg: params.cfg,
        allowAny: allowed.allowAny,
        allowedKeys: allowed.allowedKeys,
        allowedCatalog: allowed.allowedCatalog,
      }),
    visibleCatalog: ({ catalog, defaultVisibleCatalog, view }) => {
      if (view === "all") {
        return [...catalog];
      }
      if (allowed.allowAny) {
        return [...defaultVisibleCatalog];
      }
      if (visibility.providerWildcards.size === 0) {
        return [...allowed.allowedCatalog];
      }
      return dedupeModelCatalogEntries([
        ...defaultVisibleCatalog.filter((entry) =>
          visibility.providerWildcards.has(normalizeProviderId(entry.provider)),
        ),
        ...allowed.allowedCatalog.filter(
          (entry) =>
            !visibility.providerWildcards.has(normalizeProviderId(entry.provider)),
        ),
      ]);
    },
  };
  return policy;
}
