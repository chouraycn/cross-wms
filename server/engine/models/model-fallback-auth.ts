/**
 * 回退认证 — 当主认证方式失败时的回退机制
 *
 * 支持多级回退：provider 级回退、环境变量回退、
 * 默认模型回退等。
 */

import { logger } from '../../logger.js';
import {
  type ResolvedProviderAuth,
  createUnauthenticatedAuth,
  createAuthenticatedAuth,
} from './model-auth-runtime-shared.js';
import { resolveProviderAuth } from './model-provider-auth.js';
import { getProviderById } from '../modelProviderRegistry.js';

export type FallbackAuthStrategy =
  | 'same-provider-other-keys'
  | 'other-provider-same-model'
  | 'recommended-models'
  | 'any-authenticated';

export interface FallbackAuthOptions {
  strategies?: FallbackAuthStrategy[];
  maxFallbacks?: number;
  excludedProviders?: string[];
  requiredCapabilities?: string[];
}

export interface FallbackAuthResult {
  success: boolean;
  primaryAuth?: ResolvedProviderAuth;
  fallbackAuth?: ResolvedProviderAuth;
  fallbackChain: string[];
  attemptCount: number;
  errorMessage?: string;
}

export interface ModelFallbackAuthResult {
  success: boolean;
  modelId?: string;
  providerId?: string;
  fallbackChain: Array<{ modelId: string; providerId: string }>;
  attemptCount: number;
}

const DEFAULT_STRATEGIES: FallbackAuthStrategy[] = [
  'same-provider-other-keys',
  'other-provider-same-model',
  'recommended-models',
  'any-authenticated',
];

export function resolveFallbackProviderAuth(
  providerId: string,
  options: FallbackAuthOptions = {},
): FallbackAuthResult {
  const strategies = options.strategies ?? DEFAULT_STRATEGIES;
  const maxFallbacks = options.maxFallbacks ?? 5;
  const excludedProviders = new Set(options.excludedProviders ?? []);

  const fallbackChain: string[] = [];
  let attemptCount = 0;

  const primaryAuth = resolveProviderAuth(providerId);
  if (primaryAuth.status === 'authenticated') {
    return {
      success: true,
      primaryAuth,
      fallbackChain,
      attemptCount: 1,
    };
  }

  logger.debug(`[FallbackAuth] 主认证失败: ${providerId}, 尝试回退`);

  excludedProviders.add(providerId);

  for (const strategy of strategies) {
    if (attemptCount >= maxFallbacks) break;

    const result = tryStrategy(strategy, excludedProviders, maxFallbacks - attemptCount);
    if (result) {
      fallbackChain.push(...result.chain);
      attemptCount += result.attempts;
      return {
        success: true,
        primaryAuth,
        fallbackAuth: result.auth,
        fallbackChain,
        attemptCount,
      };
    }
  }

  return {
    success: false,
    primaryAuth,
    fallbackChain,
    attemptCount,
    errorMessage: `No fallback authentication found for provider: ${providerId}`,
  };
}

function tryStrategy(
  strategy: FallbackAuthStrategy,
  excludedProviders: Set<string>,
  maxAttempts: number,
): { auth: ResolvedProviderAuth; chain: string[]; attempts: number } | null {
  switch (strategy) {
    case 'other-provider-same-model':
      return tryOtherProviderSameModel(excludedProviders, maxAttempts);
    case 'recommended-models':
      return tryRecommendedModels(excludedProviders, maxAttempts);
    case 'any-authenticated':
      return tryAnyAuthenticated(excludedProviders, maxAttempts);
    default:
      return null;
  }
}

function tryOtherProviderSameModel(
  excludedProviders: Set<string>,
  maxAttempts: number,
): { auth: ResolvedProviderAuth; chain: string[]; attempts: number } | null {
  const allProviders = getAllProviderIds();
  const candidates = allProviders.filter(p => !excludedProviders.has(p));

  let attempts = 0;
  const chain: string[] = [];

  for (const providerId of candidates) {
    if (attempts >= maxAttempts) break;
    attempts++;

    const auth = resolveProviderAuth(providerId);
    if (auth.status === 'authenticated') {
      chain.push(providerId);
      excludedProviders.add(providerId);
      return { auth, chain, attempts };
    }
    chain.push(providerId);
  }

  return null;
}

function tryRecommendedModels(
  excludedProviders: Set<string>,
  maxAttempts: number,
): { auth: ResolvedProviderAuth; chain: string[]; attempts: number } | null {
  const recommended = getRecommendedProviderIds();
  const candidates = recommended.filter(p => !excludedProviders.has(p));

  let attempts = 0;
  const chain: string[] = [];

  for (const providerId of candidates) {
    if (attempts >= maxAttempts) break;
    attempts++;

    const auth = resolveProviderAuth(providerId);
    if (auth.status === 'authenticated') {
      chain.push(providerId);
      excludedProviders.add(providerId);
      return { auth, chain, attempts };
    }
    chain.push(providerId);
  }

  return null;
}

function tryAnyAuthenticated(
  excludedProviders: Set<string>,
  maxAttempts: number,
): { auth: ResolvedProviderAuth; chain: string[]; attempts: number } | null {
  const allProviders = getAllProviderIds();
  const candidates = allProviders.filter(p => !excludedProviders.has(p));

  let attempts = 0;
  const chain: string[] = [];

  for (const providerId of candidates) {
    if (attempts >= maxAttempts) break;
    attempts++;

    const auth = resolveProviderAuth(providerId);
    if (auth.status === 'authenticated') {
      chain.push(providerId);
      excludedProviders.add(providerId);
      return { auth, chain, attempts };
    }
    chain.push(providerId);
  }

  return null;
}

function getAllProviderIds(): string[] {
  try {
    const { getAllProviders } = require('../modelProviderRegistry.js');
    return getAllProviders().map((p: { id: string }) => p.id) as string[];
  } catch {
    return [];
  }
}

function getRecommendedProviderIds(): string[] {
  try {
    const { getRecommendedModels } = require('../modelProviderRegistry.js');
    const models = getRecommendedModels();
    const providerIds = new Set(models.map((m: { provider: string }) => m.provider));
    return Array.from(providerIds) as string[];
  } catch {
    return [];
  }
}

export function findFirstAuthenticatedProvider(
  providerIds: string[],
  options: { excludedProviders?: string[] } = {},
): ResolvedProviderAuth | null {
  const excluded = new Set(options.excludedProviders ?? []);

  for (const providerId of providerIds) {
    if (excluded.has(providerId)) continue;
    const auth = resolveProviderAuth(providerId);
    if (auth.status === 'authenticated') {
      return auth;
    }
  }

  return null;
}

export function createFallbackAuthResult(
  providerId: string,
  auth: ResolvedProviderAuth | null,
): FallbackAuthResult {
  if (auth && auth.status === 'authenticated') {
    return {
      success: true,
      fallbackAuth: auth,
      fallbackChain: [providerId],
      attemptCount: 1,
    };
  }
  return {
    success: false,
    fallbackChain: [providerId],
    attemptCount: 1,
    errorMessage: auth?.errorMessage || 'Authentication failed',
  };
}

export function getDefaultFallbackChain(providerId: string): string[] {
  const allProviders = getAllProviderIds();
  const index = allProviders.indexOf(providerId);
  if (index === -1) return allProviders;
  return [...allProviders.slice(index + 1), ...allProviders.slice(0, index)];
}
