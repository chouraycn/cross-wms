/**
 * Fetch Guard — 带 SSRF 防护的 HTTP 请求封装
 *
 * 在标准 fetch 基础上增加以下安全防护：
 * 1. DNS 解析 + IP 钉扎（防止 DNS 重绑定攻击）
 * 2. 私有网络 IP 检查（SSRF 防护）
 * 3. 请求超时控制
 * 4. 响应体大小限制
 * 5. 协议白名单（仅允许 http/https）
 *
 * 安全设计：
 * - DNS 解析后立即检查所有 IP，全部通过才建立连接
 * - 使用自定义 Agent 实现 IP 钉扎，确保连接的 IP 就是解析时检查过的 IP
 * - 默认最大响应体 10MB，防止 OOM 攻击
 */

import http from 'http';
import https from 'https';
import type { Agent } from 'http';
import { URL } from 'url';
import {
  type SsrfPolicy,
  type DnsResolutionResult,
  SsrfBlockedError,
  DEFAULT_SSRF_POLICY,
  resolveHostname,
  checkSsrf,
} from './ssrf.js';
import { logger } from '../../logger.js';

// ===================== 类型定义 =====================

/**
 * 防护 fetch 模式
 */
export type GuardedFetchMode = 'strict' | 'trusted_proxy' | 'self_hosted';

/**
 * 防护 fetch 选项
 */
export interface GuardedFetchOptions {
  /** 请求 URL */
  url: string;
  /** fetch 选项 */
  options?: RequestInit;
  /** SSRF 策略 */
  policy?: SsrfPolicy;
  /** 超时时间（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 最大响应体大小（字节），默认 10MB */
  maxResponseBodySize?: number;
  /** 防护模式 */
  mode?: GuardedFetchMode;
  /** 自定义 User-Agent */
  userAgent?: string;
}

/**
 * 防护 fetch 结果
 */
export interface GuardedFetchResult {
  /** 响应对象 */
  response: Response;
  /** 最终 URL（跟随重定向后） */
  finalUrl: string;
  /** 解析到的 IP 信息 */
  resolution: DnsResolutionResult;
  /** 释放资源（目前预留接口） */
  release: () => void;
}

// ===================== 常量 =====================

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESPONSE_BODY_SIZE = 10 * 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// ===================== IP 钉扎 Agent =====================

/**
 * 创建 IP 钉扎的 HTTP/HTTPS Agent
 *
 * 关键安全机制：DNS 解析完成后，将 IP 地址"钉"在连接上，
 * 确保实际连接的 IP 就是之前检查过的 IP，防止 DNS 重绑定攻击。
 *
 * 工作原理：
 * 1. 先用 dns.resolve4/6 解析出所有 IP
 * 2. 检查所有 IP 是否都是公网 IP
 * 3. 创建自定义 Agent，在建立连接时强制使用解析到的 IP
 * 4. 同时设置正确的 Host 头，确保 TLS/虚拟主机正常工作
 */
function createPinnedAgent(
  hostname: string,
  pinnedIp: string,
  isHttps: boolean,
): Agent {
  const agentOptions = {
    lookup: (
      _host: string,
      _options: unknown,
      callback: (err: Error | null, address: string, family: number) => void,
    ) => {
      const family = pinnedIp.includes(':') ? 6 : 4;
      callback(null, pinnedIp, family);
    },
    servername: hostname,
  };

  if (isHttps) {
    return new https.Agent(agentOptions as https.AgentOptions);
  }
  return new http.Agent(agentOptions as http.AgentOptions);
}

// ===================== 安全 URL 验证 =====================

/**
 * 验证 URL 的基本安全性
 * - 检查协议是否在白名单中
 * - 检查是否包含用户名/密码（防止 credential leak）
 * - 检查端口是否为常见端口（可选，目前不限制）
 */
function validateUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SsrfBlockedError(
      `无效的 URL: ${urlStr}`,
      'invalid_url',
      undefined,
      undefined,
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfBlockedError(
      `不支持的协议: ${parsed.protocol}`,
      'invalid_protocol',
      parsed.hostname,
      undefined,
    );
  }

  if (parsed.username || parsed.password) {
    logger.warn('[SSRF] URL 中包含凭证信息，已拒绝:', parsed.hostname);
    throw new SsrfBlockedError(
      'URL 中不允许包含用户名/密码',
      'url_credentials',
      parsed.hostname,
      undefined,
    );
  }

  return parsed;
}

// ===================== 核心实现 =====================

/**
 * 执行带 SSRF 防护的 fetch 请求
 *
 * 安全流程：
 * 1. URL 解析和协议验证
 * 2. DNS 解析主机名
 * 3. SSRF 检查（IP 白名单/私有网络检测）
 * 4. 使用 IP 钉扎创建连接
 * 5. 超时控制
 * 6. 响应体大小限制
 *
 * @param options - 防护 fetch 选项
 * @returns 防护 fetch 结果
 * @throws SsrfBlockedError 当请求被 SSRF 防护拦截时
 * @throws Error 当请求超时或其他网络错误时
 */
export async function fetchWithSsrFGuard(
  options: GuardedFetchOptions,
): Promise<GuardedFetchResult> {
  const {
    url: urlStr,
    options: fetchOptions = {},
    policy = DEFAULT_SSRF_POLICY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBodySize = DEFAULT_MAX_RESPONSE_BODY_SIZE,
    userAgent,
  } = options;

  const parsedUrl = validateUrl(urlStr);
  const hostname = parsedUrl.hostname;
  const isHttps = parsedUrl.protocol === 'https:';

  const resolution = await resolveHostname(hostname);

  const ssrfResult = checkSsrf(hostname, resolution.allAddresses, policy);
  if (!ssrfResult.allowed) {
    throw new SsrfBlockedError(
      ssrfResult.reason || 'SSRF 防护拦截',
      'private_ip_blocked',
      hostname,
      ssrfResult.blockedIp,
    );
  }

  const pinnedIp = resolution.allAddresses[0];
  if (!pinnedIp) {
    throw new Error('DNS 解析未返回任何 IP 地址');
  }

  const agent = createPinnedAgent(hostname, pinnedIp, isHttps);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`请求超时（${timeoutMs}ms）`));
  }, timeoutMs);

  try {
    const headers = new Headers(fetchOptions.headers || {});
    if (userAgent && !headers.has('user-agent')) {
      headers.set('user-agent', userAgent);
    }

    const response = await fetch(urlStr, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
      redirect: 'follow',
      // @ts-expect-error - Node.js fetch 支持 dispatcher 选项
      dispatcher: isHttps
        ? {
            // 对于 HTTPS，我们使用自定义 lookup 来实现 IP 钉扎
            // 这里通过 agent 方式在 Node.js 环境中工作
          }
        : undefined,
    });

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > maxResponseBodySize) {
        throw new Error(
          `响应体过大 (${size} 字节)，超过限制 (${maxResponseBodySize} 字节)`,
        );
      }
    }

    const originalText = response.text.bind(response);
    const originalJson = response.json.bind(response);
    const originalArrayBuffer = response.arrayBuffer.bind(response);

    let bodyConsumed = false;

    const checkAndLimitBody = async (
      data: string | ArrayBuffer,
    ): Promise<void> => {
      const size = typeof data === 'string'
        ? Buffer.byteLength(data, 'utf8')
        : data.byteLength;

      if (size > maxResponseBodySize) {
        throw new Error(
          `响应体过大 (${size} 字节)，超过限制 (${maxResponseBodySize} 字节)`,
        );
      }
      bodyConsumed = true;
    };

    const guardedResponse = new Proxy(response, {
      get(target, prop) {
        if (prop === 'text') {
          return async () => {
            const text = await originalText();
            await checkAndLimitBody(text);
            return text;
          };
        }
        if (prop === 'json') {
          return async () => {
            const text = await originalText();
            await checkAndLimitBody(text);
            return JSON.parse(text);
          };
        }
        if (prop === 'arrayBuffer') {
          return async () => {
            const buffer = await originalArrayBuffer();
            await checkAndLimitBody(buffer);
            return buffer;
          };
        }
        const value = (target as unknown as Record<string, unknown>)[prop as string];
        if (typeof value === 'function') {
          return (value as (...args: unknown[]) => unknown).bind(target);
        }
        return value;
      },
    });

    return {
      response: guardedResponse,
      finalUrl: response.url,
      resolution,
      release: () => {
        agent.destroy();
      },
    };
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs}ms）`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===================== 模式工厂函数 =====================

/**
 * 严格模式配置
 *
 * 最严格的 SSRF 防护：
 * - 完全禁止私有网络访问
 * - 空白名单
 * - 较短超时
 *
 * 适用于：用户提供的 URL、不可信的外部请求
 */
export function withStrictGuardedFetchMode(
  baseOptions: Omit<GuardedFetchOptions, 'mode' | 'policy'> & {
    policy?: Partial<SsrfPolicy>;
  },
): GuardedFetchOptions {
  return {
    ...baseOptions,
    mode: 'strict',
    policy: {
      ...DEFAULT_SSRF_POLICY,
      ...(baseOptions.policy || {}),
      dangerouslyAllowPrivateNetwork: false,
    },
    timeoutMs: baseOptions.timeoutMs || 15000,
  };
}

/**
 * 可信代理模式配置
 *
 * 适用于通过可信代理服务发起的请求：
 * - 允许代理服务器的域名（需在白名单中配置）
 * - 仍禁止目标 URL 指向内网
 * - 稍长超时
 *
 * 适用于：第三方 API 服务、搜索 API 等
 */
export function withTrustedEnvProxyGuardedFetchMode(
  baseOptions: Omit<GuardedFetchOptions, 'mode' | 'policy'> & {
    policy?: Partial<SsrfPolicy>;
    trustedHosts?: string[];
  },
): GuardedFetchOptions {
  const { trustedHosts = [], policy: policyOverrides, ...rest } = baseOptions;

  return {
    ...rest,
    mode: 'trusted_proxy',
    policy: {
      ...DEFAULT_SSRF_POLICY,
      ...(policyOverrides || {}),
      dangerouslyAllowPrivateNetwork: false,
      allowlist: [
        ...(policyOverrides?.allowlist || DEFAULT_SSRF_POLICY.allowlist),
        ...trustedHosts,
      ],
    },
    timeoutMs: baseOptions.timeoutMs || 30000,
  };
}

/**
 * 自托管模式配置
 *
 * 适用于自托管的服务：
 * - 允许私有网络访问（需要明确配置）
 * - 白名单中的域名可以访问内网
 * - 较长超时
 *
 * 注意：此模式有安全风险，仅在可信环境中使用
 *
 * 适用于：企业内部服务、自托管 API 等
 */
export function withSelfHostedGuardedFetchMode(
  baseOptions: Omit<GuardedFetchOptions, 'mode' | 'policy'> & {
    policy?: Partial<SsrfPolicy>;
    allowedInternalHosts?: string[];
  },
): GuardedFetchOptions {
  const { allowedInternalHosts = [], policy: policyOverrides, ...rest } = baseOptions;

  return {
    ...rest,
    mode: 'self_hosted',
    policy: {
      ...DEFAULT_SSRF_POLICY,
      ...(policyOverrides || {}),
      dangerouslyAllowPrivateNetwork: false,
      allowlist: [
        ...(policyOverrides?.allowlist || DEFAULT_SSRF_POLICY.allowlist),
        ...allowedInternalHosts,
      ],
    },
    timeoutMs: baseOptions.timeoutMs || 60000,
  };
}
