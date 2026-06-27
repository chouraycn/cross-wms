/**
 * SSRF Protection — 服务器端请求伪造防护核心模块
 *
 * 提供私有 IP 检测、DNS 解析、SSRF 策略管理等功能，
 * 用于防止服务器端请求被利用来访问内部网络资源。
 *
 * 安全原则：
 * - 默认拒绝所有私有网络访问（deny-by-default）
 * - DNS 解析后立即钉扎 IP，防止 DNS 重绑定攻击
 * - 多层次防护：域名白名单 + IP 检查 + 协议限制
 */

import dns from 'dns';
import { promisify } from 'util';
import { logger } from '../../logger.js';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

// ===================== 类型定义 =====================

/**
 * SSRF 防护策略配置
 */
export interface SsrfPolicy {
  /** 是否允许访问私有网络（默认 false，拒绝内网访问） */
  dangerouslyAllowPrivateNetwork: boolean;
  /** 是否允许 RFC 2544 基准测试范围（198.18.0.0/15） */
  allowRfc2544BenchmarkRange: boolean;
  /** 是否允许 IPv6 Unique Local 地址（fc00::/7） */
  allowIpv6UniqueLocalRange: boolean;
  /** 域名白名单列表（匹配主机名，支持子域名通配符） */
  allowlist: string[];
}

/**
 * SSRF 拦截错误
 * 当请求被 SSRF 防护拦截时抛出此错误
 */
export class SsrfBlockedError extends Error {
  public readonly hostname?: string;
  public readonly ip?: string;
  public readonly reason: string;

  constructor(message: string, reason: string, hostname?: string, ip?: string) {
    super(message);
    this.name = 'SsrfBlockedError';
    this.reason = reason;
    this.hostname = hostname;
    this.ip = ip;
  }
}

// ===================== 默认策略 =====================

/**
 * 默认 SSRF 策略（最严格）
 * - 禁止私有网络访问
 * - 禁止基准测试范围
 * - 禁止 IPv6 Unique Local
 * - 空白名单
 */
export const DEFAULT_SSRF_POLICY: SsrfPolicy = {
  dangerouslyAllowPrivateNetwork: false,
  allowRfc2544BenchmarkRange: false,
  allowIpv6UniqueLocalRange: false,
  allowlist: [],
};

// ===================== IPv4 私有范围检测 =====================

/**
 * 检查 IPv4 地址是否在指定的 CIDR 范围内
 */
function ipv4InRange(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) {
    return false;
  }

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  return ((ipNum >>> 0) & mask) === ((rangeNum >>> 0) & mask);
}

/**
 * 检查是否为 IPv4 地址
 */
function isIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === String(num);
  });
}

// ===================== IPv6 私有范围检测 =====================

/**
 * 标准化 IPv6 地址（展开简写，转换为完整的 8 组 16 进制）
 */
function normalizeIPv6(ip: string): string[] {
  let parts: string[];

  if (ip.includes('::')) {
    const [left, right] = ip.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  } else {
    parts = ip.split(':');
  }

  if (parts.length !== 8) {
    return [];
  }

  return parts.map((p) => p.padStart(4, '0').toLowerCase());
}

/**
 * 检查 IPv6 地址是否在指定的 CIDR 范围内
 */
function ipv6InRange(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  const ipParts = normalizeIPv6(ip);
  const rangeParts = normalizeIPv6(range);

  if (ipParts.length !== 8 || rangeParts.length !== 8) {
    return false;
  }

  let remaining = prefix;
  for (let i = 0; i < 8; i++) {
    if (remaining <= 0) break;

    const ipVal = parseInt(ipParts[i], 16);
    const rangeVal = parseInt(rangeParts[i], 16);

    if (remaining >= 16) {
      if (ipVal !== rangeVal) return false;
      remaining -= 16;
    } else {
      const mask = (~0 << (16 - remaining)) & 0xffff;
      if ((ipVal & mask) !== (rangeVal & mask)) return false;
      remaining = 0;
    }
  }

  return true;
}

/**
 * 检查是否为 IPv6 地址
 */
function isIPv6(ip: string): boolean {
  return normalizeIPv6(ip).length === 8;
}

// ===================== 私有 IP 检测 =====================

/**
 * 检查 IP 地址是否为私有/内部地址
 *
 * 检测的私有范围包括：
 * - IPv4:
 *   - 127.0.0.0/8    回环地址
 *   - 10.0.0.0/8     私有网络 (A类)
 *   - 172.16.0.0/12  私有网络 (B类)
 *   - 192.168.0.0/16 私有网络 (C类)
 *   - 169.254.0.0/16 链路本地
 *   - 0.0.0.0/8      本网主机
 *   - 100.64.0.0/10  共享地址空间 (CGNAT)
 * - IPv6:
 *   - ::1/128        回环地址
 *   - fc00::/7       Unique Local
 *   - fe80::/10      链路本地
 *   - ::/128         未指定地址
 *
 * @param ip - IP 地址字符串
 * @param policy - SSRF 策略（用于可选范围的判断）
 * @returns 是否为私有 IP
 */
export function isPrivateIP(ip: string, policy: SsrfPolicy = DEFAULT_SSRF_POLICY): boolean {
  const trimmed = ip.trim();

  if (isIPv4(trimmed)) {
    return isPrivateIPv4(trimmed, policy);
  }

  if (isIPv6(trimmed)) {
    return isPrivateIPv6(trimmed, policy);
  }

  logger.warn('[SSRF] 无法识别的 IP 格式，视为不安全:', ip);
  return true;
}

function isPrivateIPv4(ip: string, policy: SsrfPolicy): boolean {
  const privateRanges = [
    '127.0.0.0/8',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '169.254.0.0/16',
    '0.0.0.0/8',
    '100.64.0.0/10',
  ];

  if (!policy.allowRfc2544BenchmarkRange) {
    privateRanges.push('198.18.0.0/15');
  }

  for (const cidr of privateRanges) {
    if (ipv4InRange(ip, cidr)) {
      return true;
    }
  }

  return false;
}

function isPrivateIPv6(ip: string, policy: SsrfPolicy): boolean {
  const privateRanges = [
    '::1/128',
    'fe80::/10',
    '::/128',
  ];

  if (!policy.allowIpv6UniqueLocalRange) {
    privateRanges.push('fc00::/7');
  }

  for (const cidr of privateRanges) {
    if (ipv6InRange(ip, cidr)) {
      return true;
    }
  }

  return false;
}

// ===================== DNS 解析 =====================

/**
 * DNS 解析结果
 */
export interface DnsResolutionResult {
  hostname: string;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  allAddresses: string[];
  resolvedAt: number;
}

/**
 * 解析主机名为 IP 地址列表
 *
 * 同时解析 IPv4 和 IPv6 地址，返回所有解析到的 IP。
 * 用于 SSRF 防护时，需要检查所有解析到的 IP 是否都在允许范围内。
 *
 * @param hostname - 主机名
 * @returns 解析结果
 * @throws 如果解析失败
 */
export async function resolveHostname(hostname: string): Promise<DnsResolutionResult> {
  const trimmedHostname = hostname.trim().toLowerCase();

  if (isIPv4(trimmedHostname) || isIPv6(trimmedHostname)) {
    return {
      hostname: trimmedHostname,
      ipv4Addresses: isIPv4(trimmedHostname) ? [trimmedHostname] : [],
      ipv6Addresses: isIPv6(trimmedHostname) ? [trimmedHostname] : [],
      allAddresses: [trimmedHostname],
      resolvedAt: Date.now(),
    };
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    resolve4(trimmedHostname),
    resolve6(trimmedHostname),
  ]);

  const ipv4Addresses = ipv4Result.status === 'fulfilled' ? ipv4Result.value : [];
  const ipv6Addresses = ipv6Result.status === 'fulfilled' ? ipv6Result.value : [];

  const allAddresses = [...ipv4Addresses, ...ipv6Addresses];

  if (allAddresses.length === 0) {
    const error =
      ipv4Result.status === 'rejected'
        ? ipv4Result.reason
        : ipv6Result.status === 'rejected'
          ? ipv6Result.reason
          : new Error('DNS 解析返回空结果');

    logger.warn('[SSRF] DNS 解析失败:', trimmedHostname, error instanceof Error ? error.message : String(error));
    throw new Error(`DNS 解析失败: ${trimmedHostname}`);
  }

  return {
    hostname: trimmedHostname,
    ipv4Addresses,
    ipv6Addresses,
    allAddresses,
    resolvedAt: Date.now(),
  };
}

// ===================== 白名单检查 =====================

/**
 * 检查主机名是否在白名单中
 *
 * 支持的匹配规则：
 * - 精确匹配: example.com
 * - 子域名通配符: *.example.com 匹配所有子域名
 * - 通配符: * 匹配所有域名（不推荐）
 *
 * @param hostname - 主机名
 * @param allowlist - 白名单列表
 * @returns 是否在白名单中
 */
export function isHostnameAllowed(hostname: string, allowlist: string[]): boolean {
  const normalizedHost = hostname.trim().toLowerCase();

  for (const pattern of allowlist) {
    const normalizedPattern = pattern.trim().toLowerCase();

    if (normalizedPattern === '*') {
      return true;
    }

    if (normalizedPattern === normalizedHost) {
      return true;
    }

    if (normalizedPattern.startsWith('*.')) {
      const suffix = normalizedPattern.slice(1);
      if (normalizedHost.endsWith(suffix) || normalizedHost === suffix.slice(1)) {
        return true;
      }
    }
  }

  return false;
}

// ===================== SSRF 检查 =====================

/**
 * SSRF 检查结果
 */
export interface SsrfCheckResult {
  allowed: boolean;
  reason?: string;
  blockedIp?: string;
  hostname?: string;
}

/**
 * 对一组 IP 地址执行 SSRF 检查
 *
 * 检查所有解析到的 IP 地址，只要有一个私有 IP 就拒绝（除非策略允许）。
 * 如果主机名在白名单中，则跳过 IP 检查。
 *
 * @param hostname - 主机名
 * @param ipAddresses - IP 地址列表
 * @param policy - SSRF 策略
 * @returns 检查结果
 */
export function checkSsrf(
  hostname: string,
  ipAddresses: string[],
  policy: SsrfPolicy = DEFAULT_SSRF_POLICY,
): SsrfCheckResult {
  if (isHostnameAllowed(hostname, policy.allowlist)) {
    return {
      allowed: true,
      hostname,
    };
  }

  if (policy.dangerouslyAllowPrivateNetwork) {
    return {
      allowed: true,
      hostname,
    };
  }

  for (const ip of ipAddresses) {
    if (isPrivateIP(ip, policy)) {
      logger.warn(
        '[SSRF] 拦截私有网络访问:',
        `host=${hostname}`,
        `ip=${ip}`,
      );

      return {
        allowed: false,
        reason: `访问私有 IP 被拒绝: ${ip}`,
        blockedIp: ip,
        hostname,
      };
    }
  }

  return {
    allowed: true,
    hostname,
  };
}

// ===================== 从 Base URL 生成策略 =====================

/**
 * 从 HTTP Base URL 生成 SSRF 策略
 *
 * 解析 base URL 的主机名，将其加入白名单，用于 API 客户端等场景。
 *
 * @param baseUrl - 基础 URL
 * @param overrides - 策略覆盖项
 * @returns SSRF 策略
 */
export function ssrfPolicyFromHttpBaseUrl(
  baseUrl: string,
  overrides: Partial<SsrfPolicy> = {},
): SsrfPolicy {
  let hostname = '';
  try {
    const url = new URL(baseUrl);
    hostname = url.hostname.toLowerCase();
  } catch {
    logger.warn('[SSRF] 无效的 base URL，无法生成策略:', baseUrl);
    return { ...DEFAULT_SSRF_POLICY, ...overrides };
  }

  const allowlist = [...(overrides.allowlist || DEFAULT_SSRF_POLICY.allowlist)];

  if (hostname && !allowlist.includes(hostname)) {
    allowlist.push(hostname);
  }

  return {
    ...DEFAULT_SSRF_POLICY,
    ...overrides,
    allowlist,
  };
}
