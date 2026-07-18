/**
 * 模型认证主入口 — 模型级别的认证解析和管理
 *
 * 统一管理模型的认证状态，支持从 Provider 继承、
 * 模型级覆盖、多 Key 轮询等。
 */

import { logger } from '../../logger.js';
import {
  type ResolvedModelAuth,
  type ResolvedProviderAuth,
  type AuthStatus,
  type AuthSource,
  createAuthenticatedAuth,
  createUnauthenticatedAuth,
  createErrorAuth,
} from './model-auth-runtime-shared.js';
import { resolveProviderAuth } from './model-provider-auth.js';
import { getModelById } from '../modelProviderRegistry.js';

export interface ModelAuthResolveOptions {
  forceRefresh?: boolean;
  preferredSource?: AuthSource;
  keyIndex?: number;
  baseUrl?: string;
}

export interface ModelAuthCheckResult {
  modelId: string;
  providerId: string;
  hasAuth: boolean;
  source?: AuthSource;
  lastCheckedAt: number;
}

const modelAuthCache = new Map<string, ResolvedModelAuth>();

const CACHE_TTL_MS = 5 * 60 * 1000;

export function resolveModelAuth(
  modelId: string,
  options: ModelAuthResolveOptions = {},
): ResolvedModelAuth {
  if (!options.forceRefresh) {
    const cached = modelAuthCache.get(modelId);
    if (cached && Date.now() - cached.lastCheckedAt < CACHE_TTL_MS) {
      return cached;
    }
  }

  const result = doResolveModelAuth(modelId, options);
  modelAuthCache.set(modelId, result);

  logger.debug(
    `[ModelAuth] 解析模型认证: ${modelId} → ${result.status} (${result.source})`,
  );

  return result;
}

function doResolveModelAuth(
  modelId: string,
  options: ModelAuthResolveOptions,
): ResolvedModelAuth {
  const model = getModelById(modelId);

  if (!model) {
    return {
      modelId,
      providerId: 'unknown',
      status: 'error',
      source: 'none',
      lastCheckedAt: Date.now(),
      errorMessage: `Model not found: ${modelId}`,
    };
  }

  const providerId = model.provider;
  const providerAuth = resolveProviderAuth(providerId, {
    forceRefresh: options.forceRefresh,
    preferredSource: options.preferredSource,
    baseUrl: options.baseUrl,
  });

  if (providerAuth.status === 'authenticated') {
    return {
      modelId,
      providerId,
      status: 'authenticated',
      source: providerAuth.source,
      apiKey: providerAuth.apiKey,
      baseUrl: providerAuth.baseUrl ?? options.baseUrl,
      lastCheckedAt: Date.now(),
    };
  }

  return {
    modelId,
    providerId,
    status: providerAuth.status,
    source: providerAuth.source,
    baseUrl: providerAuth.baseUrl ?? options.baseUrl,
    lastCheckedAt: Date.now(),
    errorMessage: providerAuth.errorMessage,
  };
}

export function checkModelAuth(
  modelId: string,
  options: ModelAuthResolveOptions = {},
): ModelAuthCheckResult {
  const auth = resolveModelAuth(modelId, options);
  return {
    modelId,
    providerId: auth.providerId,
    hasAuth: auth.status === 'authenticated',
    source: auth.source,
    lastCheckedAt: auth.lastCheckedAt,
  };
}

export function hasModelAuth(modelId: string): boolean {
  return checkModelAuth(modelId).hasAuth;
}

export function getModelAuthStatus(modelId: string): AuthStatus {
  return resolveModelAuth(modelId).status;
}

export function batchResolveModelAuth(
  modelIds: string[],
  options: ModelAuthResolveOptions = {},
): ResolvedModelAuth[] {
  return modelIds.map(id => resolveModelAuth(id, options));
}

export function getAuthenticatedModels(
  modelIds: string[],
): string[] {
  return modelIds.filter(id => hasModelAuth(id));
}

export function invalidateModelAuth(modelId: string): void {
  modelAuthCache.delete(modelId);
  logger.debug(`[ModelAuth] 失效缓存: ${modelId}`);
}

export function invalidateAllModelAuth(): void {
  modelAuthCache.clear();
  logger.info('[ModelAuth] 已清空所有模型认证缓存');
}

export function getModelAuthSummary(modelIds: string[]): {
  total: number;
  authenticated: number;
  unauthenticated: number;
  pending: number;
  error: number;
} {
  let authenticated = 0;
  let unauthenticated = 0;
  let pending = 0;
  let error = 0;

  for (const modelId of modelIds) {
    const auth = resolveModelAuth(modelId);
    switch (auth.status) {
      case 'authenticated':
        authenticated++;
        break;
      case 'unauthenticated':
        unauthenticated++;
        break;
      case 'pending':
        pending++;
        break;
      case 'error':
        error++;
        break;
    }
  }

  return { total: modelIds.length, authenticated, unauthenticated, pending, error };
}
