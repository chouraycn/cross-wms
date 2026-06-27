/**
 * Web Guarded Fetch — Web 工具专用的 SSRF 防护 fetch
 *
 * 基于 infra/net/fetch-guard 构建，为 Web 工具（web_search, web_fetch, web_api_call）
 * 提供专门的网络防护层。
 *
 * 三种运行模式：
 * - strict:        严格模式，禁止所有内网访问（用户提供的 URL）
 * - trusted:       可信代理模式，允许访问可信第三方服务（搜索 API 等）
 * - self-hosted:   自托管模式，允许访问配置的内部服务（企业内网部署）
 *
 * 设计参考 openclaw 的多层防护架构。
 */

import {
  fetchWithSsrFGuard,
  withStrictGuardedFetchMode,
  withTrustedEnvProxyGuardedFetchMode,
  withSelfHostedGuardedFetchMode,
  type GuardedFetchOptions,
  type GuardedFetchResult,
  type GuardedFetchMode,
} from '../infra/net/fetch-guard.js';
import {
  type SsrfPolicy,
  SsrfBlockedError,
  DEFAULT_SSRF_POLICY,
} from '../infra/net/ssrf.js';
import { DEFAULT_WEB_TOOLS_CONFIG } from '../config/web-tools-config.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/**
 * Web 工具网络防护模式
 */
export type WebToolsNetworkMode = 'strict' | 'trusted' | 'self-hosted';

/**
 * Web 工具 fetch 选项
 */
export interface WebToolsFetchOptions {
  /** 请求 URL */
  url: string;
  /** fetch 选项 */
  options?: RequestInit;
  /** 防护模式 */
  mode?: WebToolsNetworkMode;
  /** 超时时间（毫秒），默认使用配置值 */
  timeoutMs?: number;
  /** 最大响应体大小（字节） */
  maxResponseBodySize?: number;
  /** 额外的白名单域名 */
  extraAllowlist?: string[];
  /** 自定义 User-Agent */
  userAgent?: string;
}

/**
 * Web 工具 fetch 结果
 */
export interface WebToolsFetchResult {
  /** 响应对象 */
  response: Response;
  /** 最终 URL */
  finalUrl: string;
  /** 解析到的 IP 信息 */
  resolution: {
    hostname: string;
    allAddresses: string[];
    resolvedAt: number;
  };
  /** 释放资源 */
  release: () => void;
}

// ===================== 常量 =====================

const DEFAULT_USER_AGENT = 'CrossWMS-AI/1.0';

/**
 * 默认可信服务域名（搜索 API 等）
 * 这些是 Web 工具内置的第三方服务，默认视为可信
 */
const DEFAULT_TRUSTED_HOSTS = [
  'duckduckgo.com',
  'html.duckduckgo.com',
  'api.duckduckgo.com',
];

/**
 * 映射 Web 工具模式到底层 GuardedFetchMode
 */
function mapMode(mode: WebToolsNetworkMode): GuardedFetchMode {
  switch (mode) {
    case 'strict':
      return 'strict';
    case 'trusted':
      return 'trusted_proxy';
    case 'self-hosted':
      return 'self_hosted';
    default:
      return 'strict';
  }
}

// ===================== 超时标准化 =====================

/**
 * 标准化超时时间
 *
 * 确保超时时间在合理范围内，防止：
 * - 超时过短导致正常请求失败
 * - 超时过长导致资源占用
 *
 * @param requested - 请求的超时时间（毫秒）
 * @param defaultMs - 默认超时时间（毫秒）
 * @param minMs - 最小超时时间（毫秒）
 * @param maxMs - 最大超时时间（毫秒）
 * @returns 标准化后的超时时间
 */
export function normalizeTimeout(
  requested: number | undefined,
  defaultMs: number,
  minMs: number = 1000,
  maxMs: number = 120000,
): number {
  if (requested === undefined || requested === null) {
    return defaultMs;
  }

  const num = Number(requested);
  if (isNaN(num) || num <= 0) {
    return defaultMs;
  }

  return Math.min(Math.max(num, minMs), maxMs);
}

// ===================== 模式化 fetch 函数 =====================

/**
 * 严格模式下的 Web 工具 fetch
 *
 * 最严格的安全策略：
 * - 完全禁止私有网络访问
 * - 不使用白名单（除非显式指定）
 * - 较短的超时时间
 *
 * 适用于：用户提供的任意 URL（web_fetch, web_api_call 的默认模式）
 *
 * @param options - fetch 选项
 * @returns fetch 结果
 * @throws SsrfBlockedError 当请求被 SSRF 防护拦截时
 */
export async function fetchWebToolsStrict(
  options: Omit<WebToolsFetchOptions, 'mode'>,
): Promise<WebToolsFetchResult> {
  const {
    url,
    options: fetchOptions,
    timeoutMs,
    maxResponseBodySize,
    extraAllowlist = [],
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  const normalizedTimeout = normalizeTimeout(
    timeoutMs,
    DEFAULT_WEB_TOOLS_CONFIG.fetch.timeoutMs || 15000,
  );

  const guardedOptions = withStrictGuardedFetchMode({
    url,
    options: fetchOptions,
    timeoutMs: normalizedTimeout,
    maxResponseBodySize: maxResponseBodySize || 10 * 1024 * 1024,
    userAgent,
    policy: {
      ...DEFAULT_SSRF_POLICY,
      allowlist: extraAllowlist,
    },
  });

  const result = await fetchWithSsrFGuard(guardedOptions);
  return mapResult(result);
}

/**
 * 可信模式下的 Web 工具 fetch
 *
 * 用于访问可信第三方服务：
 * - 内置可信域名白名单（搜索 API 等）
 * - 仍禁止私有网络访问
 * - 中等超时时间
 *
 * 适用于：web_search 的搜索 API 调用、已知可信的第三方服务
 *
 * @param options - fetch 选项
 * @returns fetch 结果
 * @throws SsrfBlockedError 当请求被 SSRF 防护拦截时
 */
export async function fetchWebToolsTrusted(
  options: Omit<WebToolsFetchOptions, 'mode'> & {
    trustedHosts?: string[];
  },
): Promise<WebToolsFetchResult> {
  const {
    url,
    options: fetchOptions,
    timeoutMs,
    maxResponseBodySize,
    extraAllowlist = [],
    trustedHosts = [],
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  const normalizedTimeout = normalizeTimeout(
    timeoutMs,
    DEFAULT_WEB_TOOLS_CONFIG.search.timeoutMs || 10000,
  );

  const allTrustedHosts = [...DEFAULT_TRUSTED_HOSTS, ...trustedHosts, ...extraAllowlist];

  const guardedOptions = withTrustedEnvProxyGuardedFetchMode({
    url,
    options: fetchOptions,
    timeoutMs: normalizedTimeout,
    maxResponseBodySize: maxResponseBodySize || 10 * 1024 * 1024,
    userAgent,
    trustedHosts: allTrustedHosts,
  });

  const result = await fetchWithSsrFGuard(guardedOptions);
  return mapResult(result);
}

/**
 * 自托管模式下的 Web 工具 fetch
 *
 * 用于企业内网/自托管部署场景：
 * - 允许访问配置的内部服务域名
 * - 这些域名可以解析到内网 IP
 * - 较长超时时间
 *
 * 注意：有安全风险，仅在可信环境中使用
 *
 * 适用于：自托管的搜索服务、企业内部 API 等
 *
 * @param options - fetch 选项
 * @returns fetch 结果
 * @throws SsrfBlockedError 当请求被 SSRF 防护拦截时
 */
export async function fetchWebToolsSelfHosted(
  options: Omit<WebToolsFetchOptions, 'mode'> & {
    allowedInternalHosts?: string[];
  },
): Promise<WebToolsFetchResult> {
  const {
    url,
    options: fetchOptions,
    timeoutMs,
    maxResponseBodySize,
    extraAllowlist = [],
    allowedInternalHosts = [],
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  const normalizedTimeout = normalizeTimeout(
    timeoutMs,
    30000,
    1000,
    120000,
  );

  const allAllowedHosts = [...allowedInternalHosts, ...extraAllowlist];

  const guardedOptions = withSelfHostedGuardedFetchMode({
    url,
    options: fetchOptions,
    timeoutMs: normalizedTimeout,
    maxResponseBodySize: maxResponseBodySize || 20 * 1024 * 1024,
    userAgent,
    allowedInternalHosts: allAllowedHosts,
  });

  const result = await fetchWithSsrFGuard(guardedOptions);
  return mapResult(result);
}

// ===================== 统一入口 =====================

/**
 * Web 工具专用的带防护 fetch（统一入口）
 *
 * 根据模式选择对应的防护级别：
 * - strict:    严格模式（默认）
 * - trusted:   可信代理模式
 * - self-hosted: 自托管模式
 *
 * @param options - Web 工具 fetch 选项
 * @returns fetch 结果
 * @throws SsrfBlockedError 当请求被 SSRF 防护拦截时
 *
 * @example
 * // 严格模式（用户提供的 URL）
 * const result = await fetchWithWebToolsNetworkGuard({
 *   url: userProvidedUrl,
 *   mode: 'strict',
 * });
 *
 * // 可信模式（搜索 API）
 * const result = await fetchWithWebToolsNetworkGuard({
 *   url: searchApiUrl,
 *   mode: 'trusted',
 * });
 */
export async function fetchWithWebToolsNetworkGuard(
  options: WebToolsFetchOptions,
): Promise<WebToolsFetchResult> {
  const { mode = 'strict', ...rest } = options;

  logger.debug('[WebGuardedFetch] 发起请求:', {
    url: options.url,
    mode,
  });

  try {
    switch (mode) {
      case 'strict':
        return await fetchWebToolsStrict(rest);

      case 'trusted':
        return await fetchWebToolsTrusted(rest);

      case 'self-hosted':
        return await fetchWebToolsSelfHosted(rest);

      default:
        throw new Error(`未知的网络防护模式: ${mode}`);
    }
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      logger.warn('[WebGuardedFetch] SSRF 防护拦截:', {
        url: options.url,
        mode,
        reason: error.reason,
        hostname: error.hostname,
        ip: error.ip,
      });
    }
    throw error;
  }
}

// ===================== 工具函数 =====================

function mapResult(result: GuardedFetchResult): WebToolsFetchResult {
  return {
    response: result.response,
    finalUrl: result.finalUrl,
    resolution: {
      hostname: result.resolution.hostname,
      allAddresses: result.resolution.allAddresses,
      resolvedAt: result.resolution.resolvedAt,
    },
    release: result.release,
  };
}

/**
 * 创建针对特定域名的 SSRF 策略
 *
 * 便捷函数，用于 web_api_call 等需要白名单特定域名的场景。
 *
 * @param allowedHosts - 允许的域名列表
 * @param basePolicy - 基础策略
 * @returns SSRF 策略
 */
export function createWebToolsSsrfPolicy(
  allowedHosts: string[],
  basePolicy: SsrfPolicy = DEFAULT_SSRF_POLICY,
): SsrfPolicy {
  return {
    ...basePolicy,
    allowlist: [...basePolicy.allowlist, ...allowedHosts],
  };
}

/**
 * 检查 Web 工具 URL 是否可以安全访问
 *
 * 仅执行 SSRF 检查，不发起实际请求。
 * 用于提前校验用户输入的 URL。
 *
 * @param url - 要检查的 URL
 * @param mode - 防护模式
 * @param extraAllowlist - 额外白名单
 * @returns 是否允许访问
 */
export async function isWebToolsUrlAllowed(
  url: string,
  mode: WebToolsNetworkMode = 'strict',
  extraAllowlist: string[] = [],
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    let options: GuardedFetchOptions;

    switch (mode) {
      case 'strict':
        options = withStrictGuardedFetchMode({
          url,
          policy: { allowlist: extraAllowlist },
        });
        break;
      case 'trusted':
        options = withTrustedEnvProxyGuardedFetchMode({
          url,
          trustedHosts: extraAllowlist,
        });
        break;
      case 'self-hosted':
        options = withSelfHostedGuardedFetchMode({
          url,
          allowedInternalHosts: extraAllowlist,
        });
        break;
      default:
        return { allowed: false, reason: '未知的防护模式' };
    }

    const { resolveHostname, checkSsrf } = await import('../infra/net/ssrf.js');
    const parsed = new URL(url);
    const resolution = await resolveHostname(parsed.hostname);
    const result = checkSsrf(parsed.hostname, resolution.allAddresses, options.policy || DEFAULT_SSRF_POLICY);

    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
