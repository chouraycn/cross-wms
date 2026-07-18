/**
 * 目录查找 — 模型目录的查找功能
 *
 * 提供按 ID、名称、提供商、能力等多种方式
 * 查找模型的功能。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId, normalizeModelId } from './model-selection-normalize.js';

export interface ModelLookupResult<T> {
  found: boolean;
  model?: T;
  suggestions?: T[];
}

export interface CatalogLookupOptions {
  includeAliases?: boolean;
  fuzzyMatch?: boolean;
  caseSensitive?: boolean;
  maxSuggestions?: number;
}

const DEFAULT_OPTIONS: CatalogLookupOptions = {
  includeAliases: true,
  fuzzyMatch: true,
  caseSensitive: false,
  maxSuggestions: 5,
};

export function findModelById<T extends { id: string; aliases?: string[] }>(
  models: T[],
  modelId: string,
  options: CatalogLookupOptions = DEFAULT_OPTIONS,
): ModelLookupResult<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const normalizedId = normalizeModelId(modelId);

  const exactMatch = models.find(m => {
    const id = opts.caseSensitive ? m.id : m.id.toLowerCase();
    const target = opts.caseSensitive ? modelId : modelId.toLowerCase();
    if (m.id === modelId || id === target) return true;
    if (opts.includeAliases && m.aliases) {
      return m.aliases.some(a =>
        opts.caseSensitive ? a === modelId : a.toLowerCase() === target,
      );
    }
    return false;
  });

  if (exactMatch) {
    return { found: true, model: exactMatch };
  }

  if (opts.fuzzyMatch) {
    const suggestions = findFuzzyMatches(models as unknown as Array<{ id: string; name: string; aliases?: string[] }>, modelId, opts) as unknown as T[];
    if (suggestions.length > 0) {
      return { found: false, suggestions };
    }
  }

  return { found: false };
}

export function findModelsByProvider<T extends { provider: string }>(
  models: T[],
  providerId: string,
): T[] {
  const normalized = normalizeProviderId(providerId);
  return models.filter(m => normalizeProviderId(m.provider) === normalized);
}

export function findModelsByCapability<T extends { capabilities?: string[] }>(
  models: T[],
  capability: string,
): T[] {
  return models.filter(m => m.capabilities?.includes(capability));
}

export function findModelsByCapabilities<T extends { capabilities?: string[] }>(
  models: T[],
  capabilities: string[],
  matchAll: boolean = true,
): T[] {
  return models.filter(m => {
    if (!m.capabilities || m.capabilities.length === 0) return false;
    if (matchAll) {
      return capabilities.every(cap => m.capabilities!.includes(cap));
    }
    return capabilities.some(cap => m.capabilities!.includes(cap));
  });
}

export function findModelsByName<T extends { id: string; name: string }>(
  models: T[],
  query: string,
  options: CatalogLookupOptions = DEFAULT_OPTIONS,
): T[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const queryLower = opts.caseSensitive ? query : query.toLowerCase();

  return models.filter(m => {
    const name = opts.caseSensitive ? m.name : m.name.toLowerCase();
    const id = opts.caseSensitive ? m.id : m.id.toLowerCase();
    return name.includes(queryLower) || id.includes(queryLower);
  });
}

function findFuzzyMatches<T extends { id: string; name: string; aliases?: string[] }>(
  models: T[],
  query: string,
  options: CatalogLookupOptions,
): T[] {
  const queryLower = query.toLowerCase();
  const scored: { model: T; score: number }[] = [];

  for (const model of models) {
    let score = 0;

    const idLower = model.id.toLowerCase();
    const nameLower = model.name.toLowerCase();

    if (idLower === queryLower) score += 100;
    else if (idLower.startsWith(queryLower)) score += 50;
    else if (idLower.includes(queryLower)) score += 25;

    if (nameLower === queryLower) score += 80;
    else if (nameLower.startsWith(queryLower)) score += 40;
    else if (nameLower.includes(queryLower)) score += 20;

    if (options.includeAliases && model.aliases) {
      for (const alias of model.aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower === queryLower) score += 70;
        else if (aliasLower.startsWith(queryLower)) score += 35;
        else if (aliasLower.includes(queryLower)) score += 15;
      }
    }

    if (score > 0) {
      scored.push({ model, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const maxSuggestions = options.maxSuggestions ?? 5;
  return scored.slice(0, maxSuggestions).map(s => s.model);
}

export function findBestModelByContextWindow<T extends { contextWindow?: number }>(
  models: T[],
  minContext: number,
): T | undefined {
  const qualifying = models.filter(m => (m.contextWindow ?? 0) >= minContext);
  if (qualifying.length === 0) return undefined;

  return qualifying.reduce((best, current) => {
    const bestCtx = best.contextWindow ?? 0;
    const currCtx = current.contextWindow ?? 0;
    return currCtx < bestCtx ? current : best;
  });
}

export function searchCatalog<T extends {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
  description?: string;
}>(
  models: T[],
  query: string,
): T[] {
  if (!query || !query.trim()) return models;

  const queryLower = query.toLowerCase().trim();

  return models.filter(m =>
    m.id.toLowerCase().includes(queryLower) ||
    m.name.toLowerCase().includes(queryLower) ||
    m.provider.toLowerCase().includes(queryLower) ||
    m.description?.toLowerCase().includes(queryLower) ||
    m.capabilities?.some(cap => cap.toLowerCase().includes(queryLower)),
  );
}

export function getModelLookupStats<T>(models: T[]): {
  total: number;
} {
  return { total: models.length };
}
