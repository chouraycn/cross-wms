/**
 * WebSocket 独立认证模块
 *
 * 参考 openclaw/src/gateway/server/ws-connection.ts：
 * - WS 连接建立后先发 connect.challenge，期望客户端回 auth 消息
 * - 支持的认证模式（与 openclaw 对齐）：
 *   - token / password：共享密钥认证
 *   - trusted-proxy：受信代理注入身份
 *   - device-token：设备配对令牌（device.<deviceId>.<token>）
 *   - tailscale：Tailscale whois 头认证
 *   - bootstrap-token：首次安装引导令牌
 * - 提供 flood guard：限制单 IP 每分钟连接数，防止暴力连接
 *
 * 与 gatewayAuth.ts 的区别：
 * - gatewayAuth 用于 HTTP /v1/* REST API
 * - wsAuth 用于 /gateway/ws 长连接，独立配置，避免与 HTTP 复用密钥时相互影响
 */

import type { IncomingMessage } from 'node:http';
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
  type TailscaleAuthConfig,
  type TrustedProxyAuthConfig,
} from './authModes.js';

// ==================== 配置 ====================

export interface WsAuthConfig {
  /** 启用 WS 认证（默认 false：开发模式兼容旧客户端） */
  enabled: boolean;
  /** 认证模式（未设置时按旧逻辑：token 优先于 password） */
  mode?: WsAuthMode;
  /** 允许的 Bearer Token 列表 */
  tokens: string[];
  /** 允许的 Password 列表（x-ws-password 头或 auth.password 字段） */
  passwords: string[];
  /** 单 IP 每分钟最大连接数（flood guard），0 表示不限制 */
  maxConnectionsPerMinute: number;
  /** 认证握手超时（ms），超时未认证则断开 */
  handshakeTimeoutMs: number;
  /** trusted-proxy 模式配置 */
  trustedProxy?: TrustedProxyAuthConfig;
  /** device-token 模式配置 */
  deviceToken?: DeviceTokenAuthConfig;
  /** tailscale 模式配置 */
  tailscale?: TailscaleAuthConfig;
  /** bootstrap-token 模式配置 */
  bootstrapToken?: BootstrapTokenAuthConfig;
}

const DEFAULT_CONFIG: WsAuthConfig = {
  enabled: false,
  tokens: [],
  passwords: [],
  maxConnectionsPerMinute: 10,
  handshakeTimeoutMs: 10_000,
};

let currentConfig: WsAuthConfig = { ...DEFAULT_CONFIG };

export function configureWsAuth(patch: Partial<WsAuthConfig>): void {
  const merged = { ...currentConfig, ...patch };

  // 校验 auth.mode 显式选择策略
  assertExplicitAuthModeWhenBothConfigured({
    mode: merged.mode,
    token: merged.tokens[0],
    password: merged.passwords[0],
  });

  // 校验 mode 取值合法
  if (merged.mode !== undefined && !isValidAuthMode(merged.mode)) {
    throw new Error(
      `Invalid config: wsAuth.mode "${merged.mode}" is not a valid mode. ` +
        'Valid modes: none/token/password/tailscale/device-token/bootstrap-token/trusted-proxy',
    );
  }

  currentConfig = merged;
  logger.info(
    `[WsAuth] 配置更新: enabled=${currentConfig.enabled} mode=${currentConfig.mode ?? 'auto'} tokens=${currentConfig.tokens.length} passwords=${currentConfig.passwords.length} flood=${currentConfig.maxConnectionsPerMinute}/min`,
  );
}

export function getWsAuthConfig(): WsAuthConfig {
  return currentConfig;
}

// ==================== Flood Guard ====================

interface FloodBucket {
  count: number;
  resetAt: number;
}

class WsFloodGuard {
  private readonly buckets = new Map<string, FloodBucket>();
  private readonly windowMs: number;

  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
  }

  /**
   * 检查 IP 是否允许新建连接。
   * 返回 allowed=true 时已自动累加计数。
   */
  checkAndConsume(ip: string, limit: number): { allowed: boolean; remaining: number; retryAfterSec?: number } {
    if (limit <= 0) {
      return { allowed: true, remaining: Number.POSITIVE_INFINITY };
    }
    const now = Date.now();
    let bucket = this.buckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 1, resetAt: now + this.windowMs };
      this.buckets.set(ip, bucket);
      return { allowed: true, remaining: limit - 1 };
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    return { allowed: true, remaining: limit - bucket.count };
  }

  /** 释放一次连接占用（认证失败/连接断开时回退计数，避免正常短连接被误伤） */
  release(ip: string): void {
    const bucket = this.buckets.get(ip);
    if (!bucket) return;
    bucket.count = Math.max(0, bucket.count - 1);
    if (bucket.count === 0) {
      this.buckets.delete(ip);
    }
  }

  /** 定期清理过期 bucket，避免内存泄漏 */
  cleanup(): void {
    const now = Date.now();
    for (const [ip, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(ip);
      }
    }
  }
}

const floodGuard = new WsFloodGuard();

// 每分钟清理一次过期 bucket
setInterval(() => floodGuard.cleanup(), 60_000).unref?.();

// ==================== 认证 ====================

/**
 * WS 认证模式
 *
 * 与 openclaw GatewayAuthResult.method 对齐，扩展 device-token/bootstrap-token/tailscale。
 */
export type WsAuthMode =
  | 'none'
  | 'token'
  | 'password'
  | 'tailscale'
  | 'device-token'
  | 'bootstrap-token'
  | 'trusted-proxy';

export interface WsAuthInput {
  mode?: WsAuthMode;
  token?: string;
  password?: string;
  /** device-token 模式凭证（device.<deviceId>.<token>） */
  deviceToken?: string;
  /** bootstrap-token 模式凭证 */
  bootstrapToken?: string;
  /** 认证请求关联的 HTTP 升级请求（tailscale/trusted-proxy 模式需要读取头） */
  req?: IncomingMessage;
}

export interface WsAuthResult {
  ok: boolean;
  mode?: WsAuthMode;
  reason?: string;
  /** flood guard 拒绝时的等待秒数 */
  retryAfterSec?: number;
  /** 认证通过的用户身份（trusted-proxy/tailscale） */
  user?: string;
  /** device-token 认证通过的设备 ID */
  deviceId?: string;
}

/**
 * 验证单条 WS 认证请求。
 *
 * 优先级：显式 mode > token > password
 * - enabled=false：直接通过（开发模式）
 * - 配置了 mode 时按 mode 分发，否则保留旧的自动探测逻辑
 *
 * 参考 openclaw auth-context.ts resolveConnectAuthDecisionCore：
 * - bootstrap-token 优先于其他已成功路径（QR 配对依赖此分类）
 * - device-token 作为共享 token 的回退候选
 */
export async function authenticateWs(input: WsAuthInput): Promise<WsAuthResult> {
  if (!currentConfig.enabled) {
    return { ok: true };
  }

  const configuredMode = currentConfig.mode;

  // 显式 mode 分发（与 openclaw authorizeGatewayConnectCore 对齐）
  if (configuredMode === 'none') {
    return { ok: true, mode: 'none' };
  }
  if (configuredMode === 'trusted-proxy') {
    return authenticateWsTrustedProxy(input);
  }
  if (configuredMode === 'tailscale') {
    return authenticateWsTailscale(input);
  }
  if (configuredMode === 'device-token') {
    return authenticateWsDeviceToken(input);
  }
  if (configuredMode === 'bootstrap-token') {
    return authenticateWsBootstrapToken(input);
  }

  // 旧逻辑：未配置 mode 时按候选凭证自动探测
  // bootstrap-token 候选优先（与 openclaw 一致：QR 配对需分类为 bootstrap-token）
  const bootstrapCandidate = input.bootstrapToken?.trim();
  if (bootstrapCandidate && currentConfig.bootstrapToken) {
    const result = authenticateWsBootstrapToken(input);
    if (result.ok) {
      return result;
    }
    // bootstrap 失败时继续尝试其它路径（与 openclaw pendingBootstrapFailure 行为一致）
  }

  const deviceCandidate = input.deviceToken?.trim();
  if (deviceCandidate && currentConfig.deviceToken) {
    const result = await authenticateWsDeviceToken(input);
    if (result.ok) {
      return result;
    }
  }

  const token = input.token?.trim();
  const password = input.password;

  // mode=token 或无 mode 但有 token 候选
  if (configuredMode === 'token' || (!configuredMode && token)) {
    if (!token) {
      return { ok: false, mode: 'token', reason: 'missing token' };
    }
    if (currentConfig.tokens.length === 0) {
      return { ok: false, mode: 'token', reason: 'token auth not configured' };
    }
    // 常量时间比较（与 openclaw authorizeTokenAuth 对齐）
    const matched = currentConfig.tokens.some((expected) => safeEqualSecret(token, expected));
    if (!matched) {
      return { ok: false, mode: 'token', reason: 'invalid token' };
    }
    return { ok: true, mode: 'token' };
  }

  // mode=password 或无 mode 但有 password 候选
  if (configuredMode === 'password' || password) {
    if (!password) {
      return { ok: false, mode: 'password', reason: 'missing password' };
    }
    if (currentConfig.passwords.length === 0) {
      return { ok: false, mode: 'password', reason: 'password auth not configured' };
    }
    const matched = currentConfig.passwords.some((expected) =>
      safeEqualSecret(password, expected),
    );
    if (!matched) {
      return { ok: false, mode: 'password', reason: 'invalid password' };
    }
    return { ok: true, mode: 'password' };
  }

  return { ok: false, reason: 'no credentials provided' };
}

/** WS trusted-proxy 模式认证 */
function authenticateWsTrustedProxy(input: WsAuthInput): WsAuthResult {
  if (!currentConfig.trustedProxy) {
    return { ok: false, mode: 'trusted-proxy', reason: 'trusted_proxy_config_missing' };
  }
  const result = authorizeTrustedProxy({
    req: input.req,
    trustedProxyConfig: currentConfig.trustedProxy,
  });
  if (!result.ok) {
    return { ok: false, mode: 'trusted-proxy', reason: result.reason };
  }
  return { ok: true, mode: 'trusted-proxy', user: result.user };
}

/** WS tailscale 模式认证 */
async function authenticateWsTailscale(input: WsAuthInput): Promise<WsAuthResult> {
  const result = await authorizeTailscale({ req: input.req, config: currentConfig.tailscale });
  if (!result.ok) {
    return { ok: false, mode: 'tailscale', reason: result.reason };
  }
  return { ok: true, mode: 'tailscale', user: result.user };
}

/** WS device-token 模式认证 */
async function authenticateWsDeviceToken(input: WsAuthInput): Promise<WsAuthResult> {
  if (!currentConfig.deviceToken) {
    return { ok: false, mode: 'device-token', reason: 'device_token auth not configured' };
  }
  const candidate = input.deviceToken?.trim();
  if (!candidate) {
    return { ok: false, mode: 'device-token', reason: 'missing device token' };
  }
  const result = await authorizeDeviceToken({
    rawToken: candidate,
    config: currentConfig.deviceToken,
  });
  if (!result.ok) {
    return { ok: false, mode: 'device-token', reason: result.reason };
  }
  return { ok: true, mode: 'device-token', deviceId: result.deviceId };
}

/** WS bootstrap-token 模式认证 */
function authenticateWsBootstrapToken(input: WsAuthInput): WsAuthResult {
  if (!currentConfig.bootstrapToken) {
    return { ok: false, mode: 'bootstrap-token', reason: 'bootstrap_token auth not configured' };
  }
  const candidate = input.bootstrapToken?.trim();
  const result = authorizeBootstrapToken({
    providedToken: candidate,
    config: currentConfig.bootstrapToken,
  });
  if (!result.ok) {
    return { ok: false, mode: 'bootstrap-token', reason: result.reason };
  }
  return { ok: true, mode: 'bootstrap-token' };
}

/** 在 WS 连接建立前调用：检查 flood guard */
export function checkFloodGuard(
  ip: string,
): { allowed: boolean; remaining: number; retryAfterSec?: number } {
  return floodGuard.checkAndConsume(ip, currentConfig.maxConnectionsPerMinute);
}

/** 释放 flood guard 计数 */
export function releaseFloodGuard(ip: string): void {
  floodGuard.release(ip);
}

// ==================== HTTP 升级请求预认证 ====================

/**
 * 从 HTTP 升级请求中提取并验证 WS 认证凭证（在 handleUpgrade 之前调用）。
 *
 * token 来源（优先级）：
 *   1. URL query 参数 ?token=xxx
 *   2. Sec-WebSocket-Protocol 头（格式 token.<value>，浏览器无法设置自定义头时的回退）
 * password 来源：
 *   1. URL query 参数 ?password=xxx
 *   2. x-ws-password 头
 *   3. Sec-WebSocket-Protocol 头（格式 password.<value>）
 * device-token 来源：
 *   1. URL query 参数 ?device_token=device.<deviceId>.<token>
 *   2. Authorization Bearer device.<deviceId>.<token>
 *   3. Sec-WebSocket-Protocol 头（格式 device-token.<value>）
 * bootstrap-token 来源：
 *   1. URL query 参数 ?bootstrap_token=xxx
 *   2. x-bootstrap-token 头
 *   3. Authorization Bearer <token>
 *   4. Sec-WebSocket-Protocol 头（格式 bootstrap-token.<value>）
 * tailscale/trusted-proxy 模式：
 *   - 直接从 req 头读取（Tailscale-User-Login / X-Forwarded-User 等）
 *
 * - 认证未启用时直接通过
 * - 凭证缺失或不匹配时返回 authenticated=false
 */
export async function authenticateWebSocket(req: IncomingMessage): Promise<{
  authenticated: boolean;
  reason?: string;
  mode?: WsAuthMode;
  user?: string;
  deviceId?: string;
}> {
  if (!currentConfig.enabled) {
    return { authenticated: true };
  }

  // 1) 从 URL query 提取 token / password / device_token / bootstrap_token
  const urlStr = req.url ?? '';
  let queryToken: string | undefined;
  let queryPassword: string | undefined;
  let queryDeviceToken: string | undefined;
  let queryBootstrapToken: string | undefined;
  try {
    const parsed = new URL(urlStr, 'http://localhost');
    queryToken = parsed.searchParams.get('token') ?? undefined;
    queryPassword = parsed.searchParams.get('password') ?? undefined;
    queryDeviceToken = parsed.searchParams.get('device_token') ?? undefined;
    queryBootstrapToken = parsed.searchParams.get('bootstrap_token') ?? undefined;
  } catch {
    // URL 解析失败，忽略
  }

  // 2) 从 Sec-WebSocket-Protocol 头提取（浏览器 WS 客户端回退方案）
  const protocolHeader = req.headers['sec-websocket-protocol'];
  const protocols = (Array.isArray(protocolHeader)
    ? protocolHeader
    : protocolHeader?.split(','))
    ?.map((p) => p.trim())
    .filter(Boolean) ?? [];
  let protocolToken: string | undefined;
  let protocolPassword: string | undefined;
  let protocolDeviceToken: string | undefined;
  let protocolBootstrapToken: string | undefined;
  for (const proto of protocols) {
    if (proto.startsWith('token.')) {
      protocolToken = proto.slice('token.'.length);
    } else if (proto.startsWith('password.')) {
      protocolPassword = proto.slice('password.'.length);
    } else if (proto.startsWith('device-token.')) {
      protocolDeviceToken = proto.slice('device-token.'.length);
    } else if (proto.startsWith('bootstrap-token.')) {
      protocolBootstrapToken = proto.slice('bootstrap-token.'.length);
    }
  }

  // 3) 从专用头提取 password / bootstrap-token
  const headerPasswordRaw = req.headers['x-ws-password'];
  const headerPassword = Array.isArray(headerPasswordRaw)
    ? headerPasswordRaw[0]
    : headerPasswordRaw;

  // 4) device-token / bootstrap-token 候选：复用 authModes 的提取逻辑，
  //    并叠加 query / protocol 来源
  let deviceToken = queryDeviceToken ?? protocolDeviceToken;
  if (!deviceToken) {
    const extracted = extractDeviceTokenCandidate(req);
    if (extracted) {
      deviceToken = extracted;
    }
  }
  let bootstrapToken = queryBootstrapToken ?? protocolBootstrapToken;
  if (!bootstrapToken) {
    const extracted = extractBootstrapTokenCandidate(req);
    if (extracted) {
      bootstrapToken = extracted;
    }
  }

  const token = queryToken ?? protocolToken;
  const password = queryPassword ?? protocolPassword ?? headerPassword;

  const result = await authenticateWs({
    token,
    password,
    deviceToken,
    bootstrapToken,
    req,
  });
  return {
    authenticated: result.ok,
    reason: result.reason,
    mode: result.mode,
    user: result.user,
    deviceId: result.deviceId,
  };
}

export { floodGuard };
