/**
 * 运行时共享认证状态 — 跨模块共享的认证解析结果和错误类型
 *
 * 提供统一的认证结果类型、错误类型和辅助函数，
 * 供 model-auth、model-provider-auth 等模块共享使用。
 */

import { logger } from '../../logger.js';
import { redactApiKey, isApiKeySensitive } from './model-auth-markers.js';

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'pending' | 'error';

export type AuthSource =
  | 'env'
  | 'keychain'
  | 'config'
  | 'profile'
  | 'oauth'
  | 'aws-sdk'
  | 'local'
  | 'plugin'
  | 'fallback'
  | 'none';

export interface ResolvedProviderAuth {
  providerId: string;
  status: AuthStatus;
  source: AuthSource;
  apiKey?: string;
  baseUrl?: string;
  authMode?: string;
  lastCheckedAt: number;
  errorMessage?: string;
  credentialLabel?: string;
  keyIndex?: number;
}

export interface ResolvedModelAuth {
  modelId: string;
  providerId: string;
  status: AuthStatus;
  source: AuthSource;
  apiKey?: string;
  baseUrl?: string;
  lastCheckedAt: number;
  errorMessage?: string;
}

export class ProviderAuthError extends Error {
  public readonly providerId: string;
  public readonly category: 'missing' | 'invalid' | 'expired' | 'rate-limited' | 'unknown';

  constructor(
    providerId: string,
    message: string,
    category: ProviderAuthError['category'] = 'unknown',
  ) {
    super(message);
    this.name = 'ProviderAuthError';
    this.providerId = providerId;
    this.category = category;
  }
}

export class MissingProviderAuthError extends ProviderAuthError {
  constructor(providerId: string, message?: string) {
    super(
      providerId,
      message || `No authentication configured for provider: ${providerId}`,
      'missing',
    );
    this.name = 'MissingProviderAuthError';
  }
}

export function isProviderAuthError(error: unknown): error is ProviderAuthError {
  return error instanceof ProviderAuthError;
}

export function isMissingProviderAuthError(error: unknown): error is MissingProviderAuthError {
  return error instanceof MissingProviderAuthError;
}

export function formatMissingAuthError(providerId: string, hint?: string): string {
  const parts = [`未找到 ${providerId} 的认证配置`];
  if (hint) {
    parts.push(`(${hint})`);
  }
  return parts.join(' ');
}

export function requireApiKey(
  providerId: string,
  apiKey: string | undefined,
  hint?: string,
): string {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new MissingProviderAuthError(providerId, hint);
  }
  return apiKey;
}

export function safeLogAuthResult(auth: ResolvedProviderAuth): void {
  const logData = {
    providerId: auth.providerId,
    status: auth.status,
    source: auth.source,
    lastCheckedAt: auth.lastCheckedAt,
    credentialLabel: auth.credentialLabel,
    keyIndex: auth.keyIndex,
    hasApiKey: Boolean(auth.apiKey),
    apiKeyPreview: auth.apiKey && isApiKeySensitive(auth.apiKey)
      ? redactApiKey(auth.apiKey)
      : auth.apiKey,
  };
  logger.debug(`[ModelAuth] 认证状态: ${JSON.stringify(logData)}`);
}

export function resolveAwsSdkEnvVarName(providerId: string): string {
  const upper = providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `${upper}_AWS_PROFILE`;
}

export function createUnauthenticatedAuth(providerId: string): ResolvedProviderAuth {
  return {
    providerId,
    status: 'unauthenticated',
    source: 'none',
    lastCheckedAt: Date.now(),
  };
}

export function createPendingAuth(providerId: string, source: AuthSource = 'none'): ResolvedProviderAuth {
  return {
    providerId,
    status: 'pending',
    source,
    lastCheckedAt: Date.now(),
  };
}

export function createAuthenticatedAuth(
  providerId: string,
  source: AuthSource,
  apiKey: string,
  options: Partial<ResolvedProviderAuth> = {},
): ResolvedProviderAuth {
  return {
    providerId,
    status: 'authenticated',
    source,
    apiKey,
    lastCheckedAt: Date.now(),
    ...options,
  };
}

export function createErrorAuth(
  providerId: string,
  errorMessage: string,
  source: AuthSource = 'none',
): ResolvedProviderAuth {
  return {
    providerId,
    status: 'error',
    source,
    errorMessage,
    lastCheckedAt: Date.now(),
  };
}
