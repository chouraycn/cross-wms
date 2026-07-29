/**
 * Gateway 认证模式实现
 *
 * 参考 openclaw/src/gateway/auth.ts 与 openclaw/src/gateway/auth-mode-policy.ts：
 * - trusted-proxy：从受信反向代理注入的 header 读取用户身份
 * - device-token：设备配对令牌认证（token 格式 device.<deviceId>.<token>）
 * - tailscale：通过 Tailscale whois API 校验用户身份
 * - bootstrap-token：首次安装时的引导令牌
 * - auth.mode 显式选择机制：token/password 同时配置时强制要求显式 mode
 *
 * 设计原则（与 openclaw 一致）：
 * - fail-closed：来源不可信或头缺失时返回失败，不回退到宽松策略
 * - 常量时间比较：密钥类凭证使用 safeEqualSecret 防止时序泄露
 * - 最小权限：仅当请求来自 trustedIps 时才信任代理注入的 header
 */

import type { IncomingMessage } from 'node:http';
import { logger } from '../logger.js';
import { safeEqualSecret } from '../engine/security/secret-equal.js';
import {
  isLoopbackAddress,
  isTrustedProxyAddress,
  resolveRequestClientIp,
} from './net.js';

// ==================== 认证模式类型 ====================

/**
 * Gateway 认证模式枚举
 *
 * 与 openclaw ResolvedGatewayAuthMode 对齐，并扩展 device-token/bootstrap-token/tailscale。
 */
export type GatewayAuthMode =
  | 'none'
  | 'token'
  | 'password'
  | 'tailscale'
  | 'device-token'
  | 'bootstrap-token'
  | 'trusted-proxy';

// ==================== trusted-proxy 模式 ====================

/**
 * trusted-proxy 模式配置
 *
 * 参考 openclaw GatewayTrustedProxyConfig：
 * - userHeader：受信代理注入用户身份的头名（如 'X-Forwarded-User'）
 * - trustedIps：可信代理 IP 列表（支持 CIDR）
 * - allowUsers：可选白名单，非空时仅允许列表内用户
 * - requiredHeaders：可选必带头列表，缺失则失败
 * - allowLoopback：是否允许回环地址作为代理来源（默认 false）
 */
export interface TrustedProxyAuthConfig {
  userHeader: string;
  trustedIps: string[];
  allowUsers?: string[];
  requiredHeaders?: string[];
  allowLoopback?: boolean;
}

/** trusted-proxy 认证结果 */
export interface TrustedProxyAuthResult {
  ok: boolean;
  user?: string;
  reason?: string;
}

/**
 * trusted-proxy 认证：从受信反向代理注入的 header 读取用户身份
 *
 * 参考 openclaw auth.ts authorizeTrustedProxy：
 * 1. 检查请求远端地址是否属于 trustedIps
 * 2. 回环来源需 allowLoopback 显式允许
 * 3. 检查 requiredHeaders 是否全部存在
 * 4. 从 userHeader 读取用户身份
 * 5. allowUsers 非空时校验用户是否在白名单内
 */
export function authorizeTrustedProxy(params: {
  req?: IncomingMessage;
  trustedProxyConfig: TrustedProxyAuthConfig;
}): TrustedProxyAuthResult {
  const { req, trustedProxyConfig } = params;

  if (!req) {
    return { ok: false, reason: 'trusted_proxy_no_request' };
  }

  const remoteAddr = req.socket?.remoteAddress;
  if (!remoteAddr || !isTrustedProxyAddress(remoteAddr, trustedProxyConfig.trustedIps)) {
    return { ok: false, reason: 'trusted_proxy_untrusted_source' };
  }

  // 回环来源需显式允许，避免本机非代理进程伪造 header
  const remoteIsLoopback = isLoopbackAddress(remoteAddr);
  if (remoteIsLoopback && trustedProxyConfig.allowLoopback !== true) {
    return { ok: false, reason: 'trusted_proxy_loopback_source' };
  }

  // 校验必带头
  const requiredHeaders = trustedProxyConfig.requiredHeaders ?? [];
  for (const header of requiredHeaders) {
    const value = headerValue(req.headers[header.toLowerCase()]);
    if (!value || value.trim() === '') {
      return { ok: false, reason: `trusted_proxy_missing_header_${header}` };
    }
  }

  // 从 userHeader 读取用户身份
  const userHeaderValue = headerValue(
    req.headers[trustedProxyConfig.userHeader.toLowerCase()],
  );
  if (!userHeaderValue || userHeaderValue.trim() === '') {
    return { ok: false, reason: 'trusted_proxy_user_missing' };
  }

  const user = userHeaderValue.trim();

  // allowUsers 白名单校验
  const allowUsers = trustedProxyConfig.allowUsers ?? [];
  if (allowUsers.length > 0 && !allowUsers.includes(user)) {
    return { ok: false, reason: 'trusted_proxy_user_not_allowed' };
  }

  return { ok: true, user };
}

// ==================== device-token 模式 ====================

/**
 * device-token 模式配置
 *
 * 参考 openclaw infra/device-pairing.ts verifyDeviceToken：
 * - verifyDevice：设备配对验证回调，返回 true 表示设备已配对且 token 有效
 */
export interface DeviceTokenAuthConfig {
  verifyDevice: (deviceId: string, token: string) => Promise<boolean>;
}

/** device-token 解析结果 */
export interface ParsedDeviceToken {
  deviceId: string;
  token: string;
}

/**
 * 解析 device-token 格式：device.<deviceId>.<token>
 *
 * 参考 openclaw token 格式约定。deviceId 与 token 均不能为空，且 token
 * 至少包含一个分隔点以区分 deviceId 段。
 */
export function parseDeviceToken(raw: string): ParsedDeviceToken | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('device.')) {
    return null;
  }
  const rest = trimmed.slice('device.'.length);
  // deviceId 与 token 之间以第一个点分隔；token 本身可包含点
  const sep = rest.indexOf('.');
  if (sep <= 0 || sep >= rest.length - 1) {
    return null;
  }
  const deviceId = rest.slice(0, sep).trim();
  const token = rest.slice(sep + 1).trim();
  if (!deviceId || !token) {
    return null;
  }
  return { deviceId, token };
}

/**
 * 从请求中提取 device-token 候选值
 *
 * 来源（优先级）：
 *   1. Authorization: Bearer device.<deviceId>.<token>
 *   2. URL query 参数 ?device_token=device.<deviceId>.<token>
 */
export function extractDeviceTokenCandidate(req: IncomingMessage): string | undefined {
  // 1) Authorization Bearer
  const authHeader = headerValue(req.headers['authorization']);
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      const candidate = parts[1].trim();
      if (candidate.startsWith('device.')) {
        return candidate;
      }
    }
  }
  // 2) query 参数
  const urlStr = req.url ?? '';
  try {
    const parsed = new URL(urlStr, 'http://localhost');
    const queryToken = parsed.searchParams.get('device_token') ?? undefined;
    if (queryToken && queryToken.startsWith('device.')) {
      return queryToken;
    }
  } catch {
    // URL 解析失败，忽略
  }
  return undefined;
}

/**
 * device-token 认证：验证设备是否已配对
 *
 * 参考 openclaw auth-context.ts resolveConnectAuthDecisionCore 的 device-token 分支：
 * 1. 解析 token 格式 device.<deviceId>.<token>
 * 2. 调用 verifyDevice 回调验证配对状态
 */
export async function authorizeDeviceToken(params: {
  rawToken: string;
  config: DeviceTokenAuthConfig;
}): Promise<{ ok: boolean; deviceId?: string; reason?: string }> {
  const parsed = parseDeviceToken(params.rawToken);
  if (!parsed) {
    return { ok: false, reason: 'device_token_invalid_format' };
  }
  const paired = await params.config.verifyDevice(parsed.deviceId, parsed.token);
  if (!paired) {
    return { ok: false, reason: 'device_token_not_paired' };
  }
  return { ok: true, deviceId: parsed.deviceId };
}

// ==================== tailscale 模式 ====================

/**
 * tailscale whois 身份
 *
 * 与 openclaw TailscaleWhoisIdentity 对齐。
 */
export interface TailscaleWhoisIdentity {
  login: string;
  name?: string;
}

/**
 * tailscale 模式配置
 *
 * 参考 openclaw auth.ts resolveVerifiedTailscaleUser：
 * - whoisLookup：Tailscale whois 查找函数（可注入用于测试），默认使用 readTailscaleWhoisIdentity
 */
export interface TailscaleAuthConfig {
  whoisLookup?: (ip: string) => Promise<TailscaleWhoisIdentity | null>;
}

/** Tailscale 受信代理回环地址（serve/funnel 在本机回环转发） */
const TAILSCALE_TRUSTED_PROXIES = ['127.0.0.1', '::1'] as const;

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function hasTailscaleProxyHeaders(req?: IncomingMessage): boolean {
  if (!req) {
    return false;
  }
  return Boolean(
    req.headers['x-forwarded-for'] &&
      req.headers['x-forwarded-proto'] &&
      req.headers['x-forwarded-host'],
  );
}

function isTailscaleProxyRequest(req?: IncomingMessage): boolean {
  if (!req) {
    return false;
  }
  return isLoopbackAddress(req.socket?.remoteAddress) && hasTailscaleProxyHeaders(req);
}

/**
 * 从请求头读取 Tailscale 注入的用户身份
 *
 * 参考 openclaw auth.ts getTailscaleUser：
 * - Tailscale-User-Login：登录名（必填）
 * - Tailscale-User-Name：显示名（可选，默认回退到 login）
 */
function getTailscaleUser(req?: IncomingMessage): { login: string; name: string } | null {
  if (!req) {
    return null;
  }
  const login = normalizeOptionalString(headerValue(req.headers['tailscale-user-login']));
  if (!login) {
    return null;
  }
  const nameRaw = normalizeOptionalString(headerValue(req.headers['tailscale-user-name']));
  const name = nameRaw ?? login;
  return { login, name };
}

/**
 * tailscale 模式认证：通过 Tailscale whois API 校验用户身份
 *
 * 参考 openclaw auth.ts resolveVerifiedTailscaleUser：
 * 1. 读取 Tailscale-User-Login 头，缺失则失败
 * 2. 验证请求是否来自 Tailscale 代理（回环 + 转发头）
 * 3. 解析客户端 IP
 * 4. 调用 whois API 校验 clientIp 身份是否与 header 中的 login 匹配
 */
export async function authorizeTailscale(params: {
  req?: IncomingMessage;
  config?: TailscaleAuthConfig;
}): Promise<{ ok: boolean; user?: string; reason?: string }> {
  const { req } = params;

  const tailscaleUser = getTailscaleUser(req);
  if (!tailscaleUser) {
    return { ok: false, reason: 'tailscale_user_missing' };
  }
  if (!isTailscaleProxyRequest(req)) {
    return { ok: false, reason: 'tailscale_proxy_missing' };
  }

  // 解析客户端 IP（Tailscale serve 在回环转发，需走 forwarded-for）
  const clientIp = resolveRequestClientIp(req, [...TAILSCALE_TRUSTED_PROXIES], false);
  if (!clientIp) {
    return { ok: false, reason: 'tailscale_whois_failed' };
  }

  const whoisLookup =
    params.config?.whoisLookup ?? defaultTailscaleWhoisLookup;
  const whois = await whoisLookup(clientIp);
  if (!whois?.login) {
    return { ok: false, reason: 'tailscale_whois_failed' };
  }
  if (normalizeLogin(whois.login) !== normalizeLogin(tailscaleUser.login)) {
    return { ok: false, reason: 'tailscale_user_mismatch' };
  }
  return { ok: true, user: whois.login };
}

// ==================== bootstrap-token 模式 ====================

/**
 * bootstrap-token 模式配置
 *
 * 参考 openclaw infra/device-bootstrap.ts issueDeviceBootstrapToken：
 * - token：引导令牌，从配置文件或环境变量读取
 */
export interface BootstrapTokenAuthConfig {
  token: string;
}

/**
 * 从请求中提取 bootstrap-token 候选值
 *
 * 来源（优先级）：
 *   1. Authorization: Bearer <token>（当配置了 bootstrap-token 模式时）
 *   2. URL query 参数 ?bootstrap_token=<token>
 *   3. x-bootstrap-token 头
 */
export function extractBootstrapTokenCandidate(req: IncomingMessage): string | undefined {
  // 1) Authorization Bearer
  const authHeader = headerValue(req.headers['authorization']);
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1].trim() || undefined;
    }
  }
  // 2) query 参数
  const urlStr = req.url ?? '';
  try {
    const parsed = new URL(urlStr, 'http://localhost');
    const queryToken = parsed.searchParams.get('bootstrap_token') ?? undefined;
    if (queryToken) {
      return queryToken;
    }
  } catch {
    // URL 解析失败，忽略
  }
  // 3) x-bootstrap-token 头
  const headerToken = headerValue(req.headers['x-bootstrap-token']);
  if (headerToken) {
    return headerToken.trim() || undefined;
  }
  return undefined;
}

/**
 * bootstrap-token 认证：首次安装时的引导令牌
 *
 * 参考 openclaw infra/device-bootstrap.ts verifyDeviceBootstrapToken：
 * - 使用常量时间比较，防止时序泄露
 * - 仅用于初始配对流程
 */
export function authorizeBootstrapToken(params: {
  providedToken: string | undefined;
  config: BootstrapTokenAuthConfig;
}): { ok: boolean; reason?: string } {
  if (!params.config.token) {
    return { ok: false, reason: 'bootstrap_token_not_configured' };
  }
  if (!params.providedToken) {
    return { ok: false, reason: 'bootstrap_token_missing' };
  }
  if (!safeEqualSecret(params.providedToken, params.config.token)) {
    return { ok: false, reason: 'bootstrap_token_mismatch' };
  }
  return { ok: true };
}

// ==================== auth.mode 显式选择机制 ====================

/**
 * 当 token 和 password 同时配置但 mode 未设置时的报错信息
 *
 * 参考 openclaw auth-mode-policy.ts EXPLICIT_GATEWAY_AUTH_MODE_REQUIRED_ERROR。
 */
export const EXPLICIT_AUTH_MODE_REQUIRED_ERROR =
  'Invalid config: auth.token and auth.password are both configured, but auth.mode is unset. Set auth.mode to token or password.';

/**
 * auth.mode 显式选择策略的配置视图
 *
 * 仅关注 mode/token/password 三个字段，由调用方从其配置中投影而来。
 */
export interface AuthModePolicyConfig {
  mode?: string;
  token?: string;
  password?: string;
}

/**
 * 判断是否为模糊的 token+password 配置（需强制显式 mode）
 *
 * 参考 openclaw auth-mode-policy.ts hasAmbiguousGatewayAuthModeConfig：
 * - mode 已设置（非空字符串）时返回 false
 * - token 与 password 同时配置时返回 true
 */
export function hasAmbiguousAuthModeConfig(cfg: AuthModePolicyConfig): boolean {
  if (typeof cfg.mode === 'string' && cfg.mode.trim().length > 0) {
    return false;
  }
  const tokenConfigured = isNonEmptySecret(cfg.token);
  const passwordConfigured = isNonEmptySecret(cfg.password);
  return tokenConfigured && passwordConfigured;
}

/**
 * 当 token/password 同时配置但 mode 未设置时抛出配置错误
 *
 * 参考 openclaw auth-mode-policy.ts assertExplicitGatewayAuthModeWhenBothConfigured。
 */
export function assertExplicitAuthModeWhenBothConfigured(cfg: AuthModePolicyConfig): void {
  if (!hasAmbiguousAuthModeConfig(cfg)) {
    return;
  }
  throw new Error(EXPLICIT_AUTH_MODE_REQUIRED_ERROR);
}

/**
 * 校验 auth.mode 取值是否合法
 *
 * 合法取值：none/token/password/tailscale/device-token/bootstrap-token/trusted-proxy
 */
export function isValidAuthMode(mode: string | undefined): mode is GatewayAuthMode {
  if (typeof mode !== 'string' || mode.trim() === '') {
    return false;
  }
  return (
    mode === 'none' ||
    mode === 'token' ||
    mode === 'password' ||
    mode === 'tailscale' ||
    mode === 'device-token' ||
    mode === 'bootstrap-token' ||
    mode === 'trusted-proxy'
  );
}

// ==================== 工具函数 ====================

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOptionalString(value: string | string[] | undefined): string | undefined {
  const raw = headerValue(value);
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isNonEmptySecret(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 默认 Tailscale whois 查找函数
 *
 * 懒加载 readTailscaleWhoisIdentity，避免在未启用 tailscale 模式时引入
 * 子进程依赖。失败时返回 null（fail-closed）。
 */
async function defaultTailscaleWhoisLookup(
  ip: string,
): Promise<TailscaleWhoisIdentity | null> {
  try {
    const { readTailscaleWhoisIdentity } = await import('../engine/infra/tailscale.js');
    const identity = await readTailscaleWhoisIdentity(ip);
    return identity;
  } catch (err) {
    logger.debug(`[AuthModes] Tailscale whois 查找失败: ${ip}`, err);
    return null;
  }
}
