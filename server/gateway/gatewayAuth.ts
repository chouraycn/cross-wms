/**
 * Gateway Auth — API 认证模块
 *
 * 支持的认证模式（与 openclaw 对齐）：
 * - token：API Key / Bearer Token 认证
 * - password：密码认证
 * - trusted-proxy：从受信反向代理注入的 header 读取用户身份
 * - device-token：设备配对令牌认证（device.<deviceId>.<token>）
 * - tailscale：通过 Tailscale whois API 校验用户身份
 * - bootstrap-token：首次安装时的引导令牌
 * - none：关闭认证
 *
 * 当 auth.mode 未设置时保留旧行为：apiKeys 为空则开发模式放行，
 * 否则按 Bearer Token 认证（向后兼容）。
 */

import type { Request } from 'express';
import { logger } from '../logger.js';
import { safeEqualSecret } from '../engine/security/secret-equal.js';
import {
  assertExplicitAuthModeWhenBothConfigured,
  authorizeBootstrapToken,
  authorizeDeviceToken,
  authorizeTailscale,
  authorizeTrustedProxy,
  extractBootstrapTokenCandidate,
  extractDeviceTokenCandidate,
  isValidAuthMode,
  type BootstrapTokenAuthConfig,
  type DeviceTokenAuthConfig,
  type GatewayAuthMode,
  type TailscaleAuthConfig,
  type TrustedProxyAuthConfig,
} from './authModes.js';

// ==================== 配置 ====================

interface AuthConfig {
  /** 认证模式（未设置时保留旧行为：apiKeys 为空则开发模式，否则 token） */
  mode?: GatewayAuthMode;
  /** 旧版 API Key 列表，等价于 token 模式的凭证集合 */
  apiKeys: string[];
  /** token 模式凭证（与 apiKeys 合并校验） */
  token?: string;
  /** password 模式凭证集合 */
  passwords: string[];
  /** password 模式单值（与 passwords 合并校验） */
  password?: string;
  rateLimitPerMinute: number;
  trustedProxies: string[];
  /** trusted-proxy 模式配置 */
  trustedProxy?: TrustedProxyAuthConfig;
  /** device-token 模式配置 */
  deviceToken?: DeviceTokenAuthConfig;
  /** tailscale 模式配置 */
  tailscale?: TailscaleAuthConfig;
  /** bootstrap-token 模式配置 */
  bootstrapToken?: BootstrapTokenAuthConfig;
}

const DEFAULT_CONFIG: AuthConfig = {
  apiKeys: [],
  passwords: [],
  rateLimitPerMinute: 60,
  trustedProxies: ['127.0.0.1', '::1'],
};

let config: AuthConfig = { ...DEFAULT_CONFIG };

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// ==================== 配置函数 ====================

export function configureGatewayAuth(newConfig: Partial<AuthConfig>): void {
  const merged = { ...config, ...newConfig };

  // 校验 auth.mode 显式选择策略：token/password 同时配置时强制要求显式 mode
  assertExplicitAuthModeWhenBothConfigured({
    mode: merged.mode,
    token: merged.token ?? merged.apiKeys[0],
    password: merged.password ?? merged.passwords[0],
  });

  // 校验 mode 取值合法
  if (merged.mode !== undefined && !isValidAuthMode(merged.mode)) {
    throw new Error(
      `Invalid config: auth.mode "${merged.mode}" is not a valid mode. ` +
        'Valid modes: none/token/password/tailscale/device-token/bootstrap-token/trusted-proxy',
    );
  }

  // 校验 trusted-proxy 模式必须配置 trustedProxy
  if (merged.mode === 'trusted-proxy' && !merged.trustedProxy) {
    throw new Error(
      'gateway auth mode is trusted-proxy, but no trustedProxy config was provided (set auth.trustedProxy)',
    );
  }
  if (merged.mode === 'trusted-proxy') {
    if (!merged.trustedProxy?.userHeader || merged.trustedProxy.userHeader.trim() === '') {
      throw new Error(
        'gateway auth mode is trusted-proxy, but trustedProxy.userHeader is empty (set auth.trustedProxy.userHeader)',
      );
    }
    if (merged.token) {
      throw new Error(
        'gateway auth mode is trusted-proxy, but a shared token is also configured; ' +
          'token and trusted-proxy auth are mutually exclusive',
      );
    }
  }

  config = merged;
  logger.info(
    `[GatewayAuth] 配置已更新: mode=${config.mode ?? 'auto'} API Keys ${config.apiKeys.length} 个, 速率限制 ${config.rateLimitPerMinute}/分钟`,
  );
}

export function addApiKey(key: string): void {
  if (!config.apiKeys.includes(key)) {
    config.apiKeys.push(key);
    logger.info(`[GatewayAuth] 添加 API Key: ${key.slice(0, 8)}...`);
  }
}

export function removeApiKey(key: string): void {
  const idx = config.apiKeys.indexOf(key);
  if (idx >= 0) {
    config.apiKeys.splice(idx, 1);
    logger.info(`[GatewayAuth] 移除 API Key: ${key.slice(0, 8)}...`);
  }
}

// ==================== 认证函数 ====================

export interface AuthResult {
  authenticated: boolean;
  /** 认证模式（与 openclaw GatewayAuthResult.method 对齐） */
  method?: 'none' | 'token' | 'password' | 'tailscale' | 'device-token' | 'bootstrap-token' | 'trusted-proxy';
  /** 旧字段，等价于 authenticated 的反向；保留以向后兼容 */
  error?: string;
  clientId?: string;
  /** 认证通过的用户身份（trusted-proxy/tailscale 模式） */
  user?: string;
  /** device-token 模式认证通过的设备 ID */
  deviceId?: string;
  rateLimitRemaining?: number;
}

export type GatewayAuthResult = AuthResult;

/**
 * 对 HTTP 请求进行认证
 *
 * 当 config.mode 设置时按模式分发；未设置时保留旧行为：
 * - apiKeys 为空 → 开发模式放行
 * - 否则按 Bearer Token 认证
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const clientIp = getClientIp(req);

  // 速率限制检查
  const rateLimitResult = checkRateLimit(clientIp);
  if (!rateLimitResult.allowed) {
    return {
      authenticated: false,
      error: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
    };
  }

  // 显式 mode 分发
  const mode = config.mode;
  if (mode === 'none') {
    return { authenticated: true, method: 'none', rateLimitRemaining: rateLimitResult.remaining };
  }
  if (mode === 'trusted-proxy') {
    return authenticateTrustedProxyRequest(req, rateLimitResult.remaining);
  }
  if (mode === 'tailscale') {
    return authenticateTailscaleRequest(req, rateLimitResult.remaining);
  }
  if (mode === 'device-token') {
    return authenticateDeviceTokenRequest(req, rateLimitResult.remaining);
  }
  if (mode === 'bootstrap-token') {
    return authenticateBootstrapTokenRequest(req, rateLimitResult.remaining);
  }
  if (mode === 'password') {
    return authenticatePasswordRequest(req, rateLimitResult.remaining);
  }

  // 旧行为 + token 模式（mode 未设置或 mode='token'）
  // 如果没有配置 API Key 且未配置 token，允许所有请求（开发模式）
  const tokenPool = resolveTokenPool();
  if (tokenPool.length === 0 && mode !== 'token') {
    return {
      authenticated: true,
      method: 'none',
      clientId: 'dev',
      rateLimitRemaining: rateLimitResult.remaining,
    };
  }

  // 从 Authorization Header 获取 Bearer Token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return {
      authenticated: false,
      error: 'Missing Authorization header',
    };
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return {
      authenticated: false,
      error: 'Invalid Authorization header format. Use: Bearer <API_KEY>',
    };
  }

  const apiKey = parts[1];

  // 使用常量时间比较验证 token（与 openclaw authorizeTokenAuth 对齐）
  const matched = tokenPool.some((expected) => safeEqualSecret(apiKey, expected));
  if (!matched) {
    logger.warn(`[GatewayAuth] 无效的 API Key: ${apiKey.slice(0, 8)}... from ${clientIp}`);
    return {
      authenticated: false,
      error: 'Invalid API key',
    };
  }

  return {
    authenticated: true,
    method: 'token',
    clientId: `client-${apiKey.slice(0, 8)}`,
    rateLimitRemaining: rateLimitResult.remaining,
  };
}

/** 合并 apiKeys 与 token 形成统一 token 校验池 */
function resolveTokenPool(): string[] {
  const pool = [...config.apiKeys];
  if (config.token) {
    pool.push(config.token);
  }
  return pool;
}

/** password 模式认证：从 Authorization Bearer 或 x-gateway-password 头读取 */
function authenticatePasswordRequest(req: Request, remaining: number): AuthResult {
  const passwordPool = resolvePasswordPool();
  if (passwordPool.length === 0) {
    return { authenticated: false, error: 'password auth not configured' };
  }

  // 来源 1：x-gateway-password 头
  const headerPasswordRaw = req.headers['x-gateway-password'];
  const headerPassword = Array.isArray(headerPasswordRaw)
    ? headerPasswordRaw[0]
    : headerPasswordRaw;

  // 来源 2：Authorization Bearer
  let bearerPassword: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      bearerPassword = parts[1];
    }
  }

  const password = headerPassword ?? bearerPassword;
  if (!password) {
    return { authenticated: false, error: 'missing password' };
  }

  const matched = passwordPool.some((expected) => safeEqualSecret(password, expected));
  if (!matched) {
    return { authenticated: false, error: 'invalid password' };
  }

  return {
    authenticated: true,
    method: 'password',
    clientId: `client-${password.slice(0, 8)}`,
    rateLimitRemaining: remaining,
  };
}

/** 合并 passwords 与 password 形成统一 password 校验池 */
function resolvePasswordPool(): string[] {
  const pool = [...config.passwords];
  if (config.password) {
    pool.push(config.password);
  }
  return pool;
}

/** trusted-proxy 模式 HTTP 认证 */
function authenticateTrustedProxyRequest(req: Request, remaining: number): AuthResult {
  if (!config.trustedProxy) {
    return { authenticated: false, error: 'trusted_proxy_config_missing' };
  }
  const result = authorizeTrustedProxy({ req, trustedProxyConfig: config.trustedProxy });
  if (!result.ok) {
    return { authenticated: false, error: result.reason };
  }
  return {
    authenticated: true,
    method: 'trusted-proxy',
    user: result.user,
    clientId: `proxy-${result.user}`,
    rateLimitRemaining: remaining,
  };
}

/** tailscale 模式 HTTP 认证 */
async function authenticateTailscaleRequest(req: Request, remaining: number): Promise<AuthResult> {
  const result = await authorizeTailscale({ req, config: config.tailscale });
  if (!result.ok) {
    return { authenticated: false, error: result.reason };
  }
  return {
    authenticated: true,
    method: 'tailscale',
    user: result.user,
    clientId: `ts-${result.user}`,
    rateLimitRemaining: remaining,
  };
}

/** device-token 模式 HTTP 认证 */
async function authenticateDeviceTokenRequest(
  req: Request,
  remaining: number,
): Promise<AuthResult> {
  if (!config.deviceToken) {
    return { authenticated: false, error: 'device_token auth not configured' };
  }
  const candidate = extractDeviceTokenCandidate(req);
  if (!candidate) {
    return { authenticated: false, error: 'missing device token' };
  }
  const result = await authorizeDeviceToken({ rawToken: candidate, config: config.deviceToken });
  if (!result.ok) {
    return { authenticated: false, error: result.reason };
  }
  return {
    authenticated: true,
    method: 'device-token',
    deviceId: result.deviceId,
    clientId: `device-${result.deviceId}`,
    rateLimitRemaining: remaining,
  };
}

/** bootstrap-token 模式 HTTP 认证 */
function authenticateBootstrapTokenRequest(req: Request, remaining: number): AuthResult {
  if (!config.bootstrapToken) {
    return { authenticated: false, error: 'bootstrap_token auth not configured' };
  }
  const candidate = extractBootstrapTokenCandidate(req);
  const result = authorizeBootstrapToken({ providedToken: candidate, config: config.bootstrapToken });
  if (!result.ok) {
    return { authenticated: false, error: result.reason };
  }
  return {
    authenticated: true,
    method: 'bootstrap-token',
    clientId: 'bootstrap',
    rateLimitRemaining: remaining,
  };
}

// ==================== 速率限制 ====================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

function checkRateLimit(clientIp: string): RateLimitResult {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 分钟窗口
  const limit = config.rateLimitPerMinute;

  let record = rateLimitMap.get(clientIp);

  if (!record || now >= record.resetAt) {
    // 新窗口
    record = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(clientIp, record);
    return { allowed: true, remaining: limit - 1, resetAt: record.resetAt };
  }

  record.count++;

  if (record.count > limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining: limit - record.count,
    resetAt: record.resetAt,
  };
}

// 定期清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now >= record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000);

// ==================== 工具函数 ====================

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
    const firstIp = ips.split(',')[0].trim();
    // 检查是否来自可信代理
    if (isTrustedProxy(firstIp)) {
      return firstIp;
    }
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = typeof realIp === 'string' ? realIp : realIp[0];
    if (isTrustedProxy(ip)) {
      return ip;
    }
  }

  return req.socket.remoteAddress || 'unknown';
}

function isTrustedProxy(ip: string): boolean {
  return config.trustedProxies.some((trusted) => {
    if (trusted === ip) return true;
    if (trusted.includes('/')) {
      // CIDR 格式支持
      return ip.startsWith(trusted.split('/')[0].replace(/\.\d+$/, ''));
    }
    return false;
  });
}

// ==================== 开发者模式 API Key ====================

export function generateDevApiKey(): string {
  const key = `sk-dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return key;
}
