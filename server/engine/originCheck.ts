/**
 * Origin 安全检查 — 参考 OpenClaw gateway/origin-check.ts
 *
 * 验证浏览器 Origin：
 * - 显式允许列表匹配
 * - Host 头同源回退
 * - 私有同源匹配
 * - 本地回环地址开发回退
 */

import { logger } from '../logger.js';

export type OriginCheckResult =
  | {
      ok: true;
      matchedBy: 'allowlist' | 'host-header-fallback' | 'private-same-origin' | 'local-loopback';
    }
  | { ok: false; reason: string };

interface ParsedOrigin {
  origin: string;
  host: string;
  hostname: string;
  protocol: string;
  port: string;
}

function parseOrigin(originRaw?: string): ParsedOrigin | null {
  const trimmed = (originRaw ?? '').trim();
  if (!trimmed || trimmed === 'null') {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return {
      origin: url.origin.toLowerCase(),
      host: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
      protocol: url.protocol,
      port: url.port,
    };
  } catch {
    return null;
  }
}

function normalizeHostHeader(host?: string): string {
  if (!host) return '';
  return host.trim().toLowerCase();
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function isPrivateIp(hostname: string): boolean {
  if (isLoopbackHost(hostname)) return true;

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^fd[0-9a-f]{2}:/.test(hostname)) return true;
  if (/^fe80:/.test(hostname)) return true;

  return false;
}

function isTrustedSameOriginHost(host: string, isLocalClient?: boolean): boolean {
  if (isPrivateIp(host)) return true;
  if (isLocalClient && isLoopbackHost(host)) return true;
  return false;
}

export function checkBrowserOrigin(params: {
  requestHost?: string;
  origin?: string;
  allowedOrigins?: string[];
  allowHostHeaderOriginFallback?: boolean;
  isLocalClient?: boolean;
}): OriginCheckResult {
  const parsedOrigin = parseOrigin(params.origin);

  if (!parsedOrigin) {
    return { ok: false, reason: 'origin missing or invalid' };
  }

  const allowlist = new Set(
    (params.allowedOrigins ?? [])
      .map((value) => value?.trim().toLowerCase())
      .filter(Boolean),
  );

  if (allowlist.has('*') || allowlist.has(parsedOrigin.origin)) {
    logger.debug(`[OriginCheck] 允许列表匹配: ${parsedOrigin.origin}`);
    return { ok: true, matchedBy: 'allowlist' };
  }

  for (const allowed of allowlist) {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      if (parsedOrigin.hostname.endsWith(suffix)) {
        logger.debug(`[OriginCheck] 通配符匹配: ${allowed} → ${parsedOrigin.origin}`);
        return { ok: true, matchedBy: 'allowlist' };
      }
    }
  }

  const requestHost = normalizeHostHeader(params.requestHost);

  if (
    params.allowHostHeaderOriginFallback === true &&
    requestHost &&
    parsedOrigin.host === requestHost
  ) {
    logger.debug(`[OriginCheck] Host 头回退匹配: ${parsedOrigin.origin}`);
    return { ok: true, matchedBy: 'host-header-fallback' };
  }

  if (
    requestHost &&
    parsedOrigin.host === requestHost &&
    isTrustedSameOriginHost(requestHost, params.isLocalClient)
  ) {
    logger.debug(`[OriginCheck] 私有同源匹配: ${parsedOrigin.origin}`);
    return { ok: true, matchedBy: 'private-same-origin' };
  }

  if (params.isLocalClient && isLoopbackHost(parsedOrigin.hostname)) {
    logger.debug(`[OriginCheck] 本地回环匹配: ${parsedOrigin.origin}`);
    return { ok: true, matchedBy: 'local-loopback' };
  }

  logger.warn(`[OriginCheck] Origin 被拒绝: ${parsedOrigin.origin}`);
  return { ok: false, reason: 'origin not allowed' };
}

export function getDefaultAllowedOrigins(port?: number): string[] {
  const origins = [
    'http://localhost',
    'http://127.0.0.1',
  ];

  if (port) {
    origins.push(`http://localhost:${port}`);
    origins.push(`http://127.0.0.1:${port}`);
    origins.push(`http://[::1]:${port}`);
  }

  return origins;
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  requestHost?: string,
  isLocalClient?: boolean,
): boolean {
  const result = checkBrowserOrigin({
    origin,
    allowedOrigins,
    requestHost,
    isLocalClient,
    allowHostHeaderOriginFallback: true,
  });
  return result.ok;
}