/**
 * 网关认证系统 — 参考 OpenClaw gateway/auth.ts
 *
 * 支持多种认证模式：
 * - 共享密钥认证 (shared-secret)
 * - Token 认证 (token)
 * - 密码认证 (password)
 * - 可信代理认证 (trusted-proxy)
 * - 无认证 (none)
 *
 * 集成速率限制和 IP 追踪。
 */

import { logger } from '../logger.js';

export type AuthMethod = 'none' | 'token' | 'password' | 'shared-secret' | 'trusted-proxy';

export type AuthSurface = 'http' | 'ws-control-ui';

export interface GatewayAuthResult {
  ok: boolean;
  method?: AuthMethod;
  user?: string;
  reason?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
}

export interface ConnectAuth {
  token?: string;
  password?: string;
}

export interface GatewayAuthConfig {
  sharedSecret?: string;
  allowAnonymous?: boolean;
  trustedProxies?: string[];
  rateLimit?: {
    enabled?: boolean;
    maxAttempts?: number;
    windowMs?: number;
  };
}

export interface AuthorizeGatewayConnectParams {
  auth: GatewayAuthConfig;
  connectAuth?: ConnectAuth | null;
  clientIp?: string;
  authSurface?: AuthSurface;
}

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
}

const DEFAULT_RATE_LIMIT_MAX_ATTEMPTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitStore = new Map<string, RateLimitEntry>();

function normalizeString(value?: string): string {
  return value?.trim() ?? '';
}

function isLoopbackAddress(ip?: string): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

function isTrustedProxyAddress(ip?: string, trustedProxies?: string[]): boolean {
  if (!ip || !trustedProxies?.length) return false;
  return trustedProxies.some((proxy) => ip === proxy || ip.startsWith(proxy));
}

function checkRateLimit(ip: string, config: GatewayAuthConfig): { blocked: boolean; retryAfterMs?: number } {
  const rateLimit = config.rateLimit;
  if (!rateLimit?.enabled) {
    return { blocked: false };
  }

  const maxAttempts = rateLimit.maxAttempts ?? DEFAULT_RATE_LIMIT_MAX_ATTEMPTS;
  const windowMs = rateLimit.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;

  const entry = rateLimitStore.get(ip);
  const now = Date.now();

  if (!entry) {
    rateLimitStore.set(ip, { attempts: 1, firstAttemptAt: now });
    return { blocked: false };
  }

  if (now - entry.firstAttemptAt > windowMs) {
    rateLimitStore.set(ip, { attempts: 1, firstAttemptAt: now });
    return { blocked: false };
  }

  if (entry.attempts >= maxAttempts) {
    const retryAfterMs = windowMs - (now - entry.firstAttemptAt);
    return { blocked: true, retryAfterMs };
  }

  entry.attempts++;
  return { blocked: false };
}

function safeEqualSecret(a?: string, b?: string): boolean {
  const normalizedA = normalizeString(a);
  const normalizedB = normalizeString(b);

  if (normalizedA.length !== normalizedB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < normalizedA.length; i++) {
    result |= normalizedA.charCodeAt(i) ^ normalizedB.charCodeAt(i);
  }

  return result === 0;
}

export function authorizeGatewayConnect(
  params: AuthorizeGatewayConnectParams,
): GatewayAuthResult {
  const { auth, connectAuth, clientIp, authSurface } = params;

  if (clientIp) {
    const rateLimitResult = checkRateLimit(clientIp, auth);
    if (rateLimitResult.blocked) {
      logger.warn(`[GatewayAuth] IP ${clientIp} 被速率限制`);
      return {
        ok: false,
        method: undefined,
        reason: '速率限制',
        rateLimited: true,
        retryAfterMs: rateLimitResult.retryAfterMs,
      };
    }
  }

  if (auth.allowAnonymous) {
    logger.debug('[GatewayAuth] 使用匿名认证');
    return { ok: true, method: 'none', user: 'anonymous' };
  }

  if (connectAuth?.token) {
    if (auth.sharedSecret && safeEqualSecret(connectAuth.token, auth.sharedSecret)) {
      logger.debug('[GatewayAuth] Token 认证成功');
      return { ok: true, method: 'token', user: 'token-user' };
    }
  }

  if (connectAuth?.password) {
    if (auth.sharedSecret && safeEqualSecret(connectAuth.password, auth.sharedSecret)) {
      logger.debug('[GatewayAuth] 密码认证成功');
      return { ok: true, method: 'password', user: 'password-user' };
    }
  }

  if (auth.sharedSecret && !connectAuth?.token && !connectAuth?.password) {
    return {
      ok: false,
      method: undefined,
      reason: '需要认证凭据',
    };
  }

  if (authSurface === 'ws-control-ui') {
    if (isLoopbackAddress(clientIp)) {
      logger.debug(`[GatewayAuth] 本地地址 ${clientIp} 跳过认证`);
      return { ok: true, method: 'trusted-proxy', user: 'local' };
    }

    if (isTrustedProxyAddress(clientIp, auth.trustedProxies)) {
      logger.debug(`[GatewayAuth] 可信代理 ${clientIp} 认证成功`);
      return { ok: true, method: 'trusted-proxy', user: 'proxy-user' };
    }
  }

  logger.warn('[GatewayAuth] 认证失败');
  return {
    ok: false,
    method: undefined,
    reason: '认证失败',
  };
}

export function resolveGatewayAuth(config: Record<string, unknown>): GatewayAuthConfig {
  const gatewayConfig = (config.gateway as Record<string, unknown>) ?? {};

  return {
    sharedSecret: typeof gatewayConfig.sharedSecret === 'string' ? gatewayConfig.sharedSecret : undefined,
    allowAnonymous: typeof gatewayConfig.allowAnonymous === 'boolean' ? gatewayConfig.allowAnonymous : false,
    trustedProxies: Array.isArray(gatewayConfig.trustedProxies)
      ? gatewayConfig.trustedProxies.map((p) => String(p))
      : [],
    rateLimit: typeof gatewayConfig.rateLimit === 'object'
      ? {
          enabled: typeof (gatewayConfig.rateLimit as Record<string, unknown>).enabled === 'boolean'
            ? (gatewayConfig.rateLimit as Record<string, unknown>).enabled
            : true,
          maxAttempts: typeof (gatewayConfig.rateLimit as Record<string, unknown>).maxAttempts === 'number'
            ? (gatewayConfig.rateLimit as Record<string, unknown>).maxAttempts
            : DEFAULT_RATE_LIMIT_MAX_ATTEMPTS,
          windowMs: typeof (gatewayConfig.rateLimit as Record<string, unknown>).windowMs === 'number'
            ? (gatewayConfig.rateLimit as Record<string, unknown>).windowMs
            : DEFAULT_RATE_LIMIT_WINDOW_MS,
        } as GatewayAuthConfig['rateLimit']
      : undefined,
  };
}

export function resetRateLimit(ip: string): void {
  rateLimitStore.delete(ip);
  logger.debug(`[GatewayAuth] 重置 IP ${ip} 的速率限制`);
}

export function getRateLimitStatus(ip: string): RateLimitEntry | undefined {
  return rateLimitStore.get(ip);
}