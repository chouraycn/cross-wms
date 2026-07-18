/**
 * 回退机制 — 扩展现有 modelFailover 的回退功能
 *
 * 提供更高级的回退策略，包括模型级回退、
 * Provider 级回退、能力匹配回退等。
 */

import { logger } from '../../logger.js';
import { getModelSuppressionManager } from './model-suppression.js';
import { normalizeProviderId, normalizeModelId } from './model-selection-normalize.js';

export type FallbackStrategy =
  | 'priority-list'
  | 'same-provider'
  | 'same-capability'
  | 'cheapest'
  | 'fastest'
  | 'any-available';

export interface FallbackOptions {
  strategy?: FallbackStrategy;
  maxFallbacks?: number;
  requiredCapabilities?: string[];
  excludedModels?: string[];
  excludedProviders?: string[];
  minContextWindow?: number;
  considerHealth?: boolean;
}

export interface FallbackResult<T> {
  success: boolean;
  primary?: T;
  fallback?: T;
  fallbackChain: T[];
  attemptCount: number;
  errorMessage?: string;
}

export interface ModelWithFallback {
  id: string;
  provider: string;
  capabilities?: string[];
  contextWindow?: number;
  enabled?: boolean;
  isHealthy?: boolean;
  cost?: { inputPerMillion?: number; outputPerMillion?: number };
  latencyMs?: number;
}

const DEFAULT_FALLBACK_OPTIONS: Required<Pick<FallbackOptions, 'strategy' | 'maxFallbacks' | 'considerHealth'>> = {
  strategy: 'priority-list',
  maxFallbacks: 5,
  considerHealth: true,
};

export function findFallbackModel<T extends ModelWithFallback>(
  failedModelId: string,
  allModels: T[],
  options: FallbackOptions = {},
): FallbackResult<T> {
  const opts = { ...DEFAULT_FALLBACK_OPTIONS, ...options };

  const primary = allModels.find(m => m.id === failedModelId);
  const fallbackChain: T[] = [];

  if (opts.considerHealth && primary && !primary.isHealthy && primary.enabled !== false) {
  }

  const candidates = buildFallbackCandidates(failedModelId, allModels, opts);

  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= opts.maxFallbacks) break;
    attempts++;
    fallbackChain.push(candidate);

    if (opts.considerHealth && candidate.isHealthy === false) {
      continue;
    }

    if (candidate.enabled === false) {
      continue;
    }

    const suppressionManager = getModelSuppressionManager();
    if (suppressionManager.isSuppressed(candidate.id)) {
      continue;
    }

    return {
      success: true,
      primary,
      fallback: candidate,
      fallbackChain,
      attemptCount: attempts,
    };
  }

  return {
    success: false,
    primary,
    fallbackChain,
    attemptCount: attempts,
    errorMessage: `No fallback model found for: ${failedModelId}`,
  };
}

function buildFallbackCandidates<T extends ModelWithFallback>(
  failedModelId: string,
  allModels: T[],
  options: Required<Pick<FallbackOptions, 'strategy' | 'maxFallbacks' | 'considerHealth'>> & FallbackOptions,
): T[] {
  const failedModel = allModels.find(m => m.id === failedModelId);
  const failedProvider = failedModel?.provider;

  let candidates = allModels.filter(m => {
    if (m.id === failedModelId) return false;
    if (options.excludedModels?.includes(m.id)) return false;
    if (options.excludedProviders?.includes(normalizeProviderId(m.provider))) return false;
    if (options.minContextWindow && (m.contextWindow ?? 0) < options.minContextWindow) return false;
    if (options.requiredCapabilities && options.requiredCapabilities.length > 0) {
      if (!options.requiredCapabilities.every(cap => m.capabilities?.includes(cap))) {
        return false;
      }
    }
    return true;
  });

  switch (options.strategy) {
    case 'same-provider':
      candidates = sortBySameProvider(candidates, failedProvider);
      break;
    case 'same-capability':
      candidates = sortByCapabilityMatch(candidates, failedModel);
      break;
    case 'cheapest':
      candidates = sortByCost(candidates);
      break;
    case 'fastest':
      candidates = sortByLatency(candidates);
      break;
    case 'any-available':
      break;
    case 'priority-list':
    default:
      candidates = sortByDefaultPriority(candidates, failedProvider);
      break;
  }

  return candidates;
}

function sortBySameProvider<T extends ModelWithFallback>(
  candidates: T[],
  failedProvider?: string,
): T[] {
  if (!failedProvider) return candidates;

  return [...candidates].sort((a, b) => {
    const aSame = normalizeProviderId(a.provider) === normalizeProviderId(failedProvider) ? 0 : 1;
    const bSame = normalizeProviderId(b.provider) === normalizeProviderId(failedProvider) ? 0 : 1;
    return aSame - bSame;
  });
}

function sortByCapabilityMatch<T extends ModelWithFallback>(
  candidates: T[],
  failedModel?: T,
): T[] {
  if (!failedModel?.capabilities) return candidates;

  const failedCaps = new Set(failedModel.capabilities);

  return [...candidates].sort((a, b) => {
    const aMatch = a.capabilities?.filter(c => failedCaps.has(c)).length ?? 0;
    const bMatch = b.capabilities?.filter(c => failedCaps.has(c)).length ?? 0;
    return bMatch - aMatch;
  });
}

function sortByCost<T extends ModelWithFallback>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const aCost = a.cost?.inputPerMillion ?? Infinity;
    const bCost = b.cost?.inputPerMillion ?? Infinity;
    return aCost - bCost;
  });
}

function sortByLatency<T extends ModelWithFallback>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const aLatency = a.latencyMs ?? Infinity;
    const bLatency = b.latencyMs ?? Infinity;
    return aLatency - bLatency;
  });
}

function sortByDefaultPriority<T extends ModelWithFallback>(
  candidates: T[],
  failedProvider?: string,
): T[] {
  const priorityProviders = [
    'anthropic',
    'openai',
    'google',
    'deepseek',
    'groq',
    'mistral',
  ];

  return [...candidates].sort((a, b) => {
    const aProviderPriority = priorityProviders.indexOf(normalizeProviderId(a.provider));
    const bProviderPriority = priorityProviders.indexOf(normalizeProviderId(b.provider));

    const aPriority = aProviderPriority >= 0 ? aProviderPriority : priorityProviders.length;
    const bPriority = bProviderPriority >= 0 ? bProviderPriority : priorityProviders.length;

    if (failedProvider) {
      if (normalizeProviderId(a.provider) === normalizeProviderId(failedProvider)) {
        return -1;
      }
      if (normalizeProviderId(b.provider) === normalizeProviderId(failedProvider)) {
        return 1;
      }
    }

    return aPriority - bPriority;
  });
}

export function buildFallbackChain<T extends ModelWithFallback>(
  primaryModelId: string,
  allModels: T[],
  options: FallbackOptions = {},
): T[] {
  const result = findFallbackModel(primaryModelId, allModels, options);
  return result.fallbackChain;
}

export function getFallbackStrategyDescription(strategy: FallbackStrategy): string {
  const descriptions: Record<FallbackStrategy, string> = {
    'priority-list': '按优先级列表回退',
    'same-provider': '优先同 Provider 回退',
    'same-capability': '按能力匹配回退',
    'cheapest': '按最低成本回退',
    'fastest': '按最快速度回退',
    'any-available': '任意可用模型回退',
  };
  return descriptions[strategy] ?? strategy;
}
