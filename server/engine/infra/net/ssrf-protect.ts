import { lookup as dnsLookup } from 'node:dns/promises';
import * as net from 'node:net';
import { logger } from '../../../logger.js';
import { isPrivateIpAddress, isBlockedHostname, SsrFBlockedError } from '../ssrf.js';

export type SsrfProtectOptions = {
  allowPrivateNetwork?: boolean;
  allowedHostnames?: string[];
  allowedIpRanges?: string[];
  checkDns?: boolean;
};

export async function resolveAndValidateHostname(
  hostname: string,
  options: SsrfProtectOptions = {},
  lookupFn: typeof dnsLookup = dnsLookup,
): Promise<string[]> {
  const normalized = hostname.trim().toLowerCase();

  if (options.allowedHostnames?.includes(normalized)) {
    const result = await lookupFn(hostname, { all: true });
    return result.map(r => r.address);
  }

  if (isBlockedHostname(normalized)) {
    throw new SsrFBlockedError(`Hostname ${hostname} is blocked by SSRF policy`);
  }

  if (options.checkDns !== false) {
    const addresses = await lookupFn(hostname, { all: true });
    for (const addr of addresses) {
      if (!options.allowPrivateNetwork && isPrivateIpAddress(addr.address)) {
        throw new SsrFBlockedError(`Resolved IP ${addr.address} for ${hostname} is private`);
      }
      if (options.allowedIpRanges && !isIpInRanges(addr.address, options.allowedIpRanges)) {
        throw new SsrFBlockedError(`Resolved IP ${addr.address} for ${hostname} is not in allowed ranges`);
      }
    }
    return addresses.map(r => r.address);
  }

  return [];
}

function isIpInRanges(ip: string, ranges: string[]): boolean {
  for (const range of ranges) {
    if (isIpInCidr(ip, range)) return true;
  }
  return false;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  if (net.isIPv4(ip)) {
    const [range, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (!net.isIPv4(range) || isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    const ipLong = ipToLong(ip);
    const rangeLong = ipToLong(range);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipLong & mask) === (rangeLong & mask);
  }
  return false;
}

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export async function assertSafeUrl(url: string | URL, options: SsrfProtectOptions = {}): Promise<void> {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  const hostname = parsed.hostname;
  if (!hostname) throw new SsrFBlockedError('URL has no hostname');

  if (isBlockedHostname(hostname)) {
    throw new SsrFBlockedError(`Hostname ${hostname} is blocked`);
  }

  if (net.isIP(hostname)) {
    if (!options.allowPrivateNetwork && isPrivateIpAddress(hostname)) {
      throw new SsrFBlockedError(`IP address ${hostname} is private`);
    }
    return;
  }

  await resolveAndValidateHostname(hostname, options);
}

export function createSsrfGuard(options: SsrfProtectOptions = {}) {
  return {
    validateUrl: (url: string | URL) => assertSafeUrl(url, options),
    validateHostname: (hostname: string) => resolveAndValidateHostname(hostname, options),
  };
}
