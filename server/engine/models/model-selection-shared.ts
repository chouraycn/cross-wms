/**
 * 共享选择逻辑 — 模型选择的共享工具函数
 *
 * 提供模型别名索引、允许列表构建、配置模型解析等
 * 共享功能，供 model-selection 等模块使用。
 */

import { logger } from '../../logger.js';
import {
  normalizeProviderId,
  normalizeModelId,
  modelKey,
  parseModelRef,
  type ModelRef,
  type ModelManifestNormalizationContext,
} from './model-selection-normalize.js';

export type ModelRefStatus =
  | 'valid'
  | 'invalid'
  | 'not-found'
  | 'not-allowed'
  | 'requires-auth';

export interface ModelAliasIndex {
  byProvider: Map<string, Map<string, string>>;
  byAlias: Map<string, string>;
  allModels: Map<string, string>;
}

export interface AllowedModelSet {
  allowedKeys: Set<string>;
  allowedModels: Set<string>;
  allowedProviders: Set<string>;
  hasWildcard: boolean;
}

export function buildModelAliasIndex(
  models: Array<{ id: string; provider: string; aliases?: string[] }>,
): ModelAliasIndex {
  const index: ModelAliasIndex = {
    byProvider: new Map(),
    byAlias: new Map(),
    allModels: new Map(),
  };

  for (const model of models) {
    const providerKey = normalizeProviderId(model.provider);
    const modelId = normalizeModelId(model.id);
    const key = modelKey(providerKey, modelId);

    index.allModels.set(key, model.id);

    if (!index.byProvider.has(providerKey)) {
      index.byProvider.set(providerKey, new Map());
    }
    index.byProvider.get(providerKey)!.set(modelId, model.id);

    if (model.aliases) {
      for (const alias of model.aliases) {
        index.byAlias.set(alias.toLowerCase(), model.id);
      }
    }
  }

  logger.debug(`[ModelSelectionShared] 构建别名索引: ${models.length} 个模型`);
  return index;
}

export function resolveAllowedModelRefFromAliasIndex(
  ref: string | ModelRef,
  aliasIndex: ModelAliasIndex,
): string | null {
  const parsed = typeof ref === 'string' ? parseModelRef(ref) : ref;

  if (parsed.providerId && parsed.modelId) {
    const key = modelKey(normalizeProviderId(parsed.providerId), normalizeModelId(parsed.modelId));
    if (aliasIndex.allModels.has(key)) {
      return aliasIndex.allModels.get(key)!;
    }
  }

  if (parsed.modelId) {
    const lowerId = parsed.modelId.toLowerCase();
    if (aliasIndex.byAlias.has(lowerId)) {
      return aliasIndex.byAlias.get(lowerId)!;
    }

    for (const providerMap of aliasIndex.byProvider.values()) {
      if (providerMap.has(normalizeModelId(parsed.modelId))) {
        return providerMap.get(normalizeModelId(parsed.modelId))!;
      }
    }
  }

  return null;
}

export function buildAllowedModelSetWithFallbacks(
  allowedList: string[],
  aliasIndex: ModelAliasIndex,
): AllowedModelSet {
  const allowedKeys = new Set<string>();
  const allowedModels = new Set<string>();
  const allowedProviders = new Set<string>();
  let hasWildcard = false;

  for (const entry of allowedList) {
    if (entry === '*' || entry === 'all') {
      hasWildcard = true;
      continue;
    }

    if (entry.endsWith('/*')) {
      const provider = entry.slice(0, -2);
      allowedProviders.add(normalizeProviderId(provider));
      continue;
    }

    const resolved = resolveAllowedModelRefFromAliasIndex(entry, aliasIndex);
    if (resolved) {
      allowedModels.add(resolved);
      const parsed = parseModelRef(entry);
      if (parsed.providerId) {
        allowedKeys.add(modelKey(normalizeProviderId(parsed.providerId), normalizeModelId(resolved)));
      }
    }
  }

  return { allowedKeys, allowedModels, allowedProviders, hasWildcard };
}

export function isModelAllowed(
  modelId: string,
  providerId: string,
  allowedSet: AllowedModelSet,
): boolean {
  if (allowedSet.hasWildcard) return true;

  const normProvider = normalizeProviderId(providerId);
  if (allowedSet.allowedProviders.has(normProvider)) return true;

  if (allowedSet.allowedModels.has(modelId)) return true;

  const key = modelKey(normProvider, normalizeModelId(modelId));
  if (allowedSet.allowedKeys.has(key)) return true;

  return false;
}

export function buildConfiguredAllowlistKeys(
  configuredModels: Array<{ id: string; provider: string }>,
): Set<string> {
  const keys = new Set<string>();
  for (const model of configuredModels) {
    keys.add(modelKey(normalizeProviderId(model.provider), normalizeModelId(model.id)));
  }
  return keys;
}

export function buildConfiguredModelCatalog(
  configuredModels: Array<{ id: string; provider: string; name?: string; enabled?: boolean }>,
): Array<{ id: string; provider: string; name: string; enabled: boolean }> {
  return configuredModels
    .filter(m => m.enabled !== false)
    .map(m => ({
      id: m.id,
      provider: m.provider,
      name: m.name || m.id,
      enabled: true,
    }));
}

export function resolveModelRefFromString(
  ref: string,
  context?: ModelManifestNormalizationContext,
): ModelRef {
  return parseModelRef(ref);
}

export function normalizeModelSelection(
  selection: string | { model?: string; provider?: string },
  context?: ModelManifestNormalizationContext,
): ModelRef {
  if (typeof selection === 'string') {
    return parseModelRef(selection);
  }

  return {
    providerId: selection.provider ? normalizeProviderId(selection.provider) : undefined,
    modelId: selection.model ? normalizeModelId(selection.model) : '',
    original: JSON.stringify(selection),
  };
}

export function resolveBareModelDefaultProvider(
  modelId: string,
  providers: string[],
): string | null {
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];

  const priority = ['anthropic', 'openai', 'google', 'deepseek'];
  for (const p of priority) {
    if (providers.includes(p)) return p;
  }

  return providers[0];
}

export function inferUniqueProviderFromCatalog(
  modelId: string,
  catalog: Array<{ id: string; provider: string }>,
): string | null {
  const matching = catalog.filter(
    m => normalizeModelId(m.id) === normalizeModelId(modelId),
  );
  if (matching.length === 1) {
    return matching[0].provider;
  }
  return null;
}

export function inferUniqueProviderFromConfiguredModels(
  modelId: string,
  configuredModels: Array<{ id: string; provider: string }>,
): string | null {
  return inferUniqueProviderFromCatalog(modelId, configuredModels);
}

export function getModelRefStatusWithFallbackModels(
  ref: string | ModelRef,
  aliasIndex: ModelAliasIndex,
  allowedSet: AllowedModelSet,
): ModelRefStatus {
  const parsed = typeof ref === 'string' ? parseModelRef(ref) : ref;

  if (!parsed.modelId) return 'invalid';

  const resolved = resolveAllowedModelRefFromAliasIndex(parsed, aliasIndex);
  if (!resolved) return 'not-found';

  if (parsed.providerId) {
    if (!isModelAllowed(resolved, parsed.providerId, allowedSet)) {
      return 'not-allowed';
    }
  }

  return 'valid';
}

export function resolveConfiguredModelRef(
  ref: string,
  configuredModels: Array<{ id: string; provider: string }>,
): { modelId: string; providerId: string } | null {
  const parsed = parseModelRef(ref);

  if (parsed.providerId && parsed.modelId) {
    const match = configuredModels.find(
      m =>
        normalizeProviderId(m.provider) === normalizeProviderId(parsed.providerId!) &&
        normalizeModelId(m.id) === normalizeModelId(parsed.modelId),
    );
    if (match) return { modelId: match.id, providerId: match.provider };
  }

  if (parsed.modelId) {
    const match = configuredModels.find(
      m => normalizeModelId(m.id) === normalizeModelId(parsed.modelId),
    );
    if (match) return { modelId: match.id, providerId: match.provider };
  }

  return null;
}

export function resolveConfiguredOpenRouterCompatAlias(
  modelId: string,
): string | null {
  const openRouterAliases: Record<string, string> = {
    'anthropic/claude-3-5-sonnet': 'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o': 'openai/gpt-4o',
  };

  return openRouterAliases[modelId.toLowerCase()] || null;
}

export function resolveHooksGmailModel(_context?: unknown): string | null {
  return null;
}
