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
