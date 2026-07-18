/**
 * Link Extractor — 链接信息提取器
 *
 * 从文本中提取裸 HTTP(S) URL，解析为结构化 LinkInfo。
 * 参考 openclaw/src/link-understanding/detect.ts，使用 cross-wms 的 SSRF 模块。
 */

import { isPrivateIP } from '../../infra/net/ssrf.js';
import { DEFAULT_EXTRACT_OPTIONS } from './types.js';
import type { ExtractLinksOptions, LinkInfo } from './types.js';

/** 已知内网/回环主机名后缀与字面量 */
const INTERNAL_HOSTNAME_PATTERNS = [
  'localhost',
  'localhost.localdomain',
  'local',
  'internal',
  'host.docker.internal',
  'metadata.google.internal',
];

/** 判断主机名是否为内网地址。
 *  IP 地址委托给 SSRF 模块的 isPrivateIP；主机名匹配已知内部模式。 */
function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // IPv6 主机在 URL 中带方括号，isPrivateIP 无法处理，先剥离
  const stripped = lower.startsWith('[') && lower.endsWith(']')
    ? lower.slice(1, -1)
    : lower;
  // 仅当看起来像 IP 时才走 isPrivateIP；否则该函数会把所有域名误判为私有
  if (isLikelyIp(stripped)) {
    return isPrivateIP(stripped);
  }
  for (const pattern of INTERNAL_HOSTNAME_PATTERNS) {
    if (lower === pattern || lower.endsWith('.' + pattern)) {
      return true;
    }
  }
  return false;
}

/** 粗略判断字符串是否像 IP 地址（IPv4 或 IPv6） */
function isLikelyIp(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  if (value.includes(':') && /^[0-9a-f:]+$/i.test(value)) return true;
  return false;
}

/** Markdown 链接语法 [text](url) 需要剥离，避免误提取 */
const MARKDOWN_LINK_RE = /\[[^\]]*]\((https?:\/\/\S+?)\)/gi;
/** 裸 URL 正则 */
const BARE_LINK_RE = /https?:\/\/\S+/gi;

function stripMarkdownLinks(message: string): string {
  return message.replace(MARKDOWN_LINK_RE, ' ');
}

function resolveMaxLinks(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_EXTRACT_OPTIONS.maxLinks;
}

/** 提取 eTLD+1（简化版：取最后两段，适用于常见域名） */
export function extractDomain(hostname: string): string | undefined {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length < 2) return undefined;
  // 处理常见多段 TLD（如 .com.cn / .co.uk）
  const lastTwo = parts.slice(-2).join('.');
  const multiPartTlds = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'co.uk', 'co.jp', 'com.au'];
  if (multiPartTlds.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/** 解析单个 URL 为 LinkInfo，无效 URL 返回 null */
export function parseLinkInfo(raw: string): LinkInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const port = parsed.port ? parseInt(parsed.port, 10) : undefined;
  const hostname = parsed.hostname;
  const isPrivate = isPrivateHost(hostname);
  return {
    url: raw,
    protocol: parsed.protocol.replace(/:$/, ''),
    hostname,
    port,
    pathname: parsed.pathname || '/',
    search: parsed.search || undefined,
    hash: parsed.hash || undefined,
    domain: extractDomain(hostname),
    isPrivate,
  };
}

/** 判断 URL 是否为 IP 主机（而非域名） */
export function isIpHost(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

/**
 * 从文本中提取唯一、过滤后的 HTTP(S) 链接。
 * Markdown 链接会被忽略，避免展示用引用触发抓取。
 */
export function extractLinksFromMessage(
  message: string,
  opts?: ExtractLinksOptions,
): string[] {
  const source = message?.trim();
  if (!source) return [];

  const maxLinks = resolveMaxLinks(opts?.maxLinks);
  const filterPrivate = opts?.filterPrivate ?? DEFAULT_EXTRACT_OPTIONS.filterPrivate;
  const filterNonHttp = opts?.filterNonHttp ?? DEFAULT_EXTRACT_OPTIONS.filterNonHttp;

  const sanitized = stripMarkdownLinks(source);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const match of sanitized.matchAll(BARE_LINK_RE)) {
    const raw = match[0]?.trim();
    if (!raw) continue;
    const info = parseLinkInfo(raw);
    if (!info) continue;
    if (filterNonHttp && info.protocol !== 'http' && info.protocol !== 'https') continue;
    if (filterPrivate && info.isPrivate) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push(raw);
    if (results.length >= maxLinks) break;
  }
  return results;
}

/**
 * 提取链接并解析为 LinkInfo 列表。
 * 与 extractLinksFromMessage 不同，保留被过滤的链接信息（标记 isPrivate 等）。
 */
export function extractLinkInfos(
  message: string,
  opts?: ExtractLinksOptions,
): LinkInfo[] {
  const source = message?.trim();
  if (!source) return [];

  const maxLinks = resolveMaxLinks(opts?.maxLinks);
  const filterPrivate = opts?.filterPrivate ?? DEFAULT_EXTRACT_OPTIONS.filterPrivate;
  const filterNonHttp = opts?.filterNonHttp ?? DEFAULT_EXTRACT_OPTIONS.filterNonHttp;

  const sanitized = stripMarkdownLinks(source);
  const seen = new Set<string>();
  const results: LinkInfo[] = [];

  for (const match of sanitized.matchAll(BARE_LINK_RE)) {
    const raw = match[0]?.trim();
    if (!raw) continue;
    const info = parseLinkInfo(raw);
    if (!info) continue;
    if (filterNonHttp && info.protocol !== 'http' && info.protocol !== 'https') continue;
    if (filterPrivate && info.isPrivate) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push(info);
    if (results.length >= maxLinks) break;
  }
  return results;
}
