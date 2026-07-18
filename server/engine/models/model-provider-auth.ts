/**
 * Provider 认证 — 提供商级别的认证解析和管理
 *
 * 统一管理 Provider 的认证解析，支持环境变量、配置文件、
 * Keychain 等多种认证来源。
 */

import { logger } from '../../logger.js';
import { getProviderById } from '../modelProviderRegistry.js';
import { resolveEnvApiKey, hasEnvApiKey } from './model-auth-env.js';
import {
  createAuthenticatedAuth,
  createUnauthenticatedAuth,
  createErrorAuth,
  createPendingAuth,
  type ResolvedProviderAuth,
  type AuthSource,
  safeLogAuthResult,
} from './model-auth-runtime-shared.js';
import { getProviderAuthStateStore } from './model-provider-auth-state.js';

export interface ProviderAuthResolveOptions {
  forceRefresh?: boolean;
  preferredSource?: AuthSource;
  skipCache?: boolean;
  baseUrl?: string;
}

export interface ProviderAuthCheckResult {
  providerId: string;
  hasAuth: boolean;
  source?: AuthSource;
  lastCheckedAt: number;
}

const AUTH_SOURCE_PRIORITY: AuthSource[] = [
  'config',
  'keychain',
  'env',
  'profile',
  'oauth',
  'aws-sdk',
  'local',
  'plugin',
];

export function resolveProviderAuth(
  providerId: string,
  options: ProviderAuthResolveOptions = {},
): ResolvedProviderAuth {
  const stateStore = getProviderAuthStateStore();

  if (!options.forceRefresh && !options.skipCache) {
    const cached = stateStore.getState(providerId);
    if (cached && !stateStore.isStale(providerId)) {
      const provider = getProviderById(providerId);
      return {
        providerId,
        status: cached.status,
        source: cached.source,
        lastCheckedAt: cached.lastCheckedAt,
        errorMessage: cached.lastError,
        baseUrl: options.baseUrl ?? provider?.baseUrl,
      };
    }
  }

  const result = doResolveProviderAuth(providerId, options);

  stateStore.setState(providerId, result);
  safeLogAuthResult(result);

  return result;
}

function doResolveProviderAuth(
  providerId: string,
  options: ProviderAuthResolveOptions,
): ResolvedProviderAuth {
  const provider = getProviderById(providerId);

  if (!provider) {
    return createErrorAuth(providerId, `Provider not found: ${providerId}`);
  }

  if (provider.isLocal) {
    return createAuthenticatedAuth(providerId, 'local', '', {
      baseUrl: options.baseUrl ?? provider.baseUrl,
    });
  }

  if (provider.authType === 'none') {
    return createAuthenticatedAuth(providerId, 'local', '', {
      baseUrl: options.baseUrl ?? provider.baseUrl,
    });
  }

  if (options.preferredSource) {
    const sourceResult = tryResolveFromSource(providerId, options.preferredSource, options);
    if (sourceResult) return sourceResult;
  }

  for (const source of AUTH_SOURCE_PRIORITY) {
    if (options.preferredSource && source === options.preferredSource) continue;
    const sourceResult = tryResolveFromSource(providerId, source, options);
    if (sourceResult) return sourceResult;
  }

  return createUnauthenticatedAuth(providerId);
}

function tryResolveFromSource(
  providerId: string,
  source: AuthSource,
  options: ProviderAuthResolveOptions,
): ResolvedProviderAuth | null {
  const provider = getProviderById(providerId);
  if (!provider) return null;

  switch (source) {
    case 'env':
      return tryResolveFromEnv(providerId, options);
    case 'local':
      if (provider.isLocal) {
        return createAuthenticatedAuth(providerId, 'local', '', {
          baseUrl: options.baseUrl ?? provider.baseUrl,
        });
      }
      return null;
    default:
      return null;
  }
}

function tryResolveFromEnv(
  providerId: string,
  options: ProviderAuthResolveOptions,
): ResolvedProviderAuth | null {
  const envResult = resolveEnvApiKey(providerId);
  if (envResult) {
    const provider = getProviderById(providerId);
    return createAuthenticatedAuth(providerId, 'env', envResult.apiKey, {
      baseUrl: options.baseUrl ?? provider?.baseUrl,
      credentialLabel: envResult.source,
    });
  }
  return null;
}

export function checkProviderAuth(
  providerId: string,
  options: ProviderAuthResolveOptions = {},
): ProviderAuthCheckResult {
  const stateStore = getProviderAuthStateStore();
  const cached = stateStore.getState(providerId);

  if (!options.forceRefresh && cached && !stateStore.isStale(providerId)) {
    return {
      providerId,
      hasAuth: cached.status === 'authenticated',
      source: cached.source,
      lastCheckedAt: cached.lastCheckedAt,
    };
  }

  const resolved = resolveProviderAuth(providerId, options);
  return {
    providerId,
    hasAuth: resolved.status === 'authenticated',
    source: resolved.source,
    lastCheckedAt: resolved.lastCheckedAt,
  };
}

export function hasProviderAuth(providerId: string): boolean {
  return checkProviderAuth(providerId).hasAuth;
}

export function batchResolveProviderAuth(
  providerIds: string[],
  options: ProviderAuthResolveOptions = {},
): ResolvedProviderAuth[] {
  return providerIds.map(id => resolveProviderAuth(id, options));
}

export function getAuthenticatedProviders(options?: ProviderAuthResolveOptions): string[] {
  const stateStore = getProviderAuthStateStore();
  const cached = stateStore.getAuthenticatedProviders();

  if (cached.length > 0 && !options?.forceRefresh) {
    return cached;
  }

  return [];
}

export function refreshAllProviderAuth(): void {
  const stateStore = getProviderAuthStateStore();
  stateStore.invalidateAll();
  logger.info('[ProviderAuth] 已刷新所有 Provider 认证缓存');
}

export function getProviderAuthSummary(): {
  total: number;
  authenticated: number;
  unauthenticated: number;
  pending: number;
  error: number;
} {
  return getProviderAuthStateStore().getSummary();
}
