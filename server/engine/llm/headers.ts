/**
 * 请求头管理 — 认证 / 用户代理 / 追踪。
 *
 * 提供统一的请求头构造能力，支持：
 * - 不同认证方式（Bearer / x-api-key / api-key）
 * - 用户代理与版本标识
 * - 请求追踪 ID（X-Request-Id）
 * - 自定义头合并
 */
import type { ProviderRequestContext } from './providers/types.js';

/** 认证方式。 */
export type AuthScheme = 'bearer' | 'x-api-key' | 'api-key' | 'query' | 'none';

/** 请求头构造选项。 */
export type HeaderOptions = {
  /** 认证方式。 */
  authScheme?: AuthScheme;
  /** API key。 */
  apiKey?: string;
  /** 自定义用户代理。 */
  userAgent?: string;
  /** 请求追踪 ID。 */
  requestId?: string;
  /** 会话 ID。 */
  sessionId?: string;
  /** 额外头。 */
  extra?: Record<string, string>;
};

/** 默认用户代理。 */
export const DEFAULT_USER_AGENT = 'cross-wms-llm/1.0';

/** 根据认证方式构造认证头。 */
export function buildAuthHeaders(scheme: AuthScheme, apiKey?: string): Record<string, string> {
  if (!apiKey) return {};
  switch (scheme) {
    case 'bearer':
      return { Authorization: `Bearer ${apiKey}` };
    case 'x-api-key':
      return { 'x-api-key': apiKey };
    case 'api-key':
      return { 'api-key': apiKey };
    case 'query':
    case 'none':
      return {};
  }
}

/** 构造请求头集合。 */
export function buildHeaders(options: HeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
    Accept: 'application/json',
  };
  const authScheme = options.authScheme ?? 'bearer';
  Object.assign(headers, buildAuthHeaders(authScheme, options.apiKey));
  if (options.requestId) {
    headers['X-Request-Id'] = options.requestId;
  }
  if (options.sessionId) {
    headers['X-Session-Id'] = options.sessionId;
  }
  if (options.extra) {
    Object.assign(headers, options.extra);
  }
  return headers;
}

/** 合并多个头集合（后者覆盖前者）。 */
export function mergeHeaders(...sources: Array<Record<string, string> | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const src of sources) {
    if (src) Object.assign(result, src);
  }
  return result;
}

/** 生成随机请求 ID。 */
export function generateRequestId(): string {
  // 简单的 UUID v4 实现
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 将 Headers 对象转为普通记录。 */
export function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** 过滤敏感头（用于日志输出）。 */
export function redactSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const sensitive = ['authorization', 'x-api-key', 'api-key', 'cookie', 'set-cookie'];
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (sensitive.includes(key.toLowerCase())) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** 根据 ProviderRequestContext 构造追踪头。 */
export function buildTracingHeaders(ctx: ProviderRequestContext & { requestId?: string; sessionId?: string }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (ctx.requestId) headers['X-Request-Id'] = ctx.requestId;
  if (ctx.sessionId) headers['X-Session-Id'] = ctx.sessionId;
  headers['X-Provider'] = ctx.model.provider;
  headers['X-Model'] = ctx.model.id;
  return headers;
}
