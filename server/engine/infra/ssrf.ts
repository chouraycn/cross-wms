import { lookup as dnsLookup } from 'node:dns/promises';
import { logger } from '../../logger.js';

export class SsrFBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrFBlockedError';
  }
}

export type SsrFPolicy = {
  allowPrivateNetwork?: boolean;
  dangerouslyAllowPrivateNetwork?: boolean;
  allowedHostnames?: string[];
  allowedOrigins?: string[];
  hostnameAllowlist?: string[];
};

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

const PRIVATE_IPV4_PREFIXES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '127.',
  '0.',
  '169.254.',
  '100.64.', '100.65.', '100.66.', '100.67.', '100.68.', '100.69.', '100.70.', '100.71.', '100.72.', '100.73.', '100.74.', '100.75.', '100.76.', '100.77.', '100.78.', '100.79.',
  '100.80.', '100.81.', '100.82.', '100.83.', '100.84.', '100.85.', '100.86.', '100.87.', '100.88.', '100.89.', '100.90.', '100.91.', '100.92.', '100.93.', '100.94.', '100.95.',
  '100.96.', '100.97.', '100.98.', '100.99.', '100.100.', '100.101.', '100.102.', '100.103.', '100.104.', '100.105.', '100.106.', '100.107.', '100.108.', '100.109.', '100.110.', '100.111.',
  '100.112.', '100.113.', '100.114.', '100.115.', '100.116.', '100.117.', '100.118.', '100.119.', '100.120.', '100.121.', '100.122.', '100.123.', '100.124.', '100.125.', '100.126.', '100.127.',
];

export function isPrivateIpAddress(address: string, _policy?: SsrFPolicy): boolean {
  const trimmed = address.replace(/^\[|\]$/g, '').trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    const parts = trimmed.split('.').map(Number);
    if (parts.some(n => n < 0 || n > 255 || isNaN(n))) return true;
    if (parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  if (trimmed.includes(':')) {
    const lower = trimmed.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.split(':').pop() ?? '';
      return isPrivateIpAddress(v4);
    }
    return false;
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.+$/, '');
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  return false;
}

export function isBlockedHostnameOrIp(hostname: string, policy?: SsrFPolicy): boolean {
  const cleaned = hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (policy?.dangerouslyAllowPrivateNetwork || policy?.allowPrivateNetwork) {
    if (isBlockedHostname(cleaned)) return true;
    return false;
  }
  if (isBlockedHostname(cleaned)) return true;
  if (isPrivateIpAddress(cleaned, policy)) return true;
  if (policy?.allowedHostnames?.includes(cleaned)) return false;
  if (policy?.hostnameAllowlist) {
    for (const pattern of policy.hostnameAllowlist) {
      if (pattern.startsWith('*.') && cleaned.endsWith(pattern.slice(1))) return false;
      if (pattern === cleaned) return false;
    }
    return true;
  }
  return false;
}

export async function resolvePinnedHostname(hostname: string, lookupFn: typeof dnsLookup = dnsLookup): Promise<string[]> {
  try {
    const result = await lookupFn(hostname, { all: true });
    return result.map(r => r.address);
  } catch (err) {
    logger.error(`[SSRF] DNS lookup failed for ${hostname}`, err);
    throw new SsrFBlockedError(`DNS lookup failed for hostname: ${hostname}`);
  }
}

export function assertPublicHostname(hostname: string): void {
  if (isBlockedHostnameOrIp(hostname)) {
    throw new SsrFBlockedError(`Hostname ${hostname} is blocked by SSRF policy`);
  }
}

// ==================== 便捷 URL 级 API ====================
// 参考 openclaw/src/infra/net/ssrf.ts 暴露的高级断言接口，方便上层在发起
// 网络请求之前对完整 URL 做安全校验。

/**
 * 检查 IP 是否为私有地址（10.x / 172.16-31.x / 192.168.x / 127.x / 0.x / ::1 等）。
 * 与 isPrivateIpAddress 等价，提供更简短的命名以供外部使用。
 */
export function isPrivateIp(ip: string, policy?: SsrFPolicy): boolean {
  return isPrivateIpAddress(ip, policy);
}

/**
 * 检查 IP 是否为回环地址（IPv4 127.0.0.0/8 或 IPv6 ::1）。
 */
export function isLoopback(ip: string): boolean {
  const trimmed = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    const parts = trimmed.split('.').map(Number);
    return parts[0] === 127;
  }
  if (trimmed.includes(':')) {
    return trimmed === '::1';
  }
  return false;
}

/**
 * 检查 IP 是否为链路本地地址（IPv4 169.254.0.0/16 或 IPv6 fe80::/10）。
 * 链路本地地址常用于云元数据服务（如 169.254.169.254），必须阻止。
 */
export function isLinkLocal(ip: string): boolean {
  const trimmed = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    const parts = trimmed.split('.').map(Number);
    return parts[0] === 169 && parts[1] === 254;
  }
  if (trimmed.includes(':')) {
    // fe80::/10 链路本地：前 10 位为 1111111010，即 fe80:: ~ febf::
    return /^fe[89ab][0-9a-f]?:/.test(trimmed);
  }
  return false;
}

export type UrlSafetyResult = {
  safe: boolean;
  reason?: string;
  hostname?: string;
};

/**
 * 检查 URL 是否安全（禁止访问内网/回环/被阻止的 hostname）。
 * - 解析失败：视为不安全
 * - 非 http/https：视为不安全
 * - hostname 落入阻止列表或 IP 为私有：视为不安全
 */
export function checkUrlSafety(url: string, policy?: SsrFPolicy): UrlSafetyResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { safe: false, reason: 'empty url' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, reason: 'invalid url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `unsupported protocol: ${parsed.protocol}` };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname) {
    return { safe: false, reason: 'missing hostname' };
  }
  if (isBlockedHostnameOrIp(hostname, policy)) {
    return { safe: false, reason: `blocked hostname or private ip: ${hostname}`, hostname };
  }
  return { safe: true, hostname };
}

/**
 * DNS 解析 hostname 返回所有 IP 地址。
 * - 若 hostname 本身就是 IP 字面量，直接返回
 * - 解析失败时抛出 SsrFBlockedError
 */
export async function resolveUrlIp(hostname: string): Promise<string[]> {
  const cleaned = hostname.replace(/^\[|\]$/g, '').trim();
  // IP 字面量无需 DNS 解析
  if (/^\d+\.\d+\.\d+\.\d+$/.test(cleaned) || cleaned.includes(':')) {
    return [cleaned];
  }
  try {
    const result = await dnsLookup(cleaned, { all: true });
    return result.map((r) => r.address);
  } catch (err) {
    logger.error(`[SSRF] DNS lookup failed for ${hostname}`, err);
    throw new SsrFBlockedError(`DNS lookup failed for hostname: ${hostname}`);
  }
}

/**
 * 异步检查 URL 是否安全（含 DNS 解析校验，防止 DNS rebinding 攻击）。
 * - 先做同步检查（协议 / hostname / IP 字面量）
 * - 再对域名做 DNS 解析，校验解析结果中是否包含私有/内网 IP
 * - 任一解析 IP 为私有 → 不安全
 */
export async function isUrlSafe(
  url: string,
  policy?: SsrFPolicy,
): Promise<{ safe: boolean; reason?: string }> {
  const syncResult = checkUrlSafety(url, policy);
  if (!syncResult.safe) {
    return { safe: false, reason: syncResult.reason };
  }
  const hostname = syncResult.hostname ?? '';
  // 仅对域名做 DNS 解析校验（IP 字面量已在 checkUrlSafety 中检查过）
  if (
    hostname &&
    !isBlockedHostname(hostname) &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
    !hostname.includes(':')
  ) {
    try {
      const ips = await resolveUrlIp(hostname);
      for (const ip of ips) {
        if (isPrivateIpAddress(ip, policy)) {
          return { safe: false, reason: `resolved ip is private/internal: ${ip}` };
        }
      }
    } catch (err) {
      return { safe: false, reason: `dns resolution failed: ${(err as Error).message}` };
    }
  }
  return { safe: true };
}

/**
 * 断言 URL 安全，不安全时抛出 SsrFBlockedError。
 * 异步版本：包含 DNS 解析校验，防止 DNS rebinding。
 * label 用于在错误消息中标注 URL 来源，便于排查。
 */
export async function assertSafeUrl(
  url: string,
  label?: string,
  policy?: SsrFPolicy,
): Promise<void> {
  const result = await isUrlSafe(url, policy);
  if (!result.safe) {
    const tag = label ? `[${label}] ` : '';
    throw new SsrFBlockedError(`${tag}URL ${url} is not safe: ${result.reason}`);
  }
}

/**
 * 创建 SSRF 安全的 fetch 包装。
 * 在发起请求前对 URL 做异步安全校验（含 DNS 解析），校验通过后才执行 fetch。
 *
 * 用法：
 * ```ts
 * const safeFetch = createSsrfSafeFetcher();
 * const res = await safeFetch('https://example.com/api');
 * ```
 */
export function createSsrfSafeFetcher(
  policy?: SsrFPolicy,
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    await assertSafeUrl(urlStr, 'ssrf-safe-fetcher', policy);
    return fetch(url, init);
  };
}
