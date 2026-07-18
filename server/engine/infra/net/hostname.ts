import { logger } from '../../../logger.js';

const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const RESERVED_TOP_LEVEL_DOMAINS = new Set([
  'localhost',
  'local',
  'internal',
  'test',
  'example',
  'invalid',
]);

export function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false;
  if (!HOSTNAME_REGEX.test(hostname)) return false;
  const labels = hostname.split('.');
  return labels.every(label => label.length > 0 && label.length <= 63);
}

export function isReservedTld(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.+$/, '');
  const parts = lower.split('.');
  const tld = parts[parts.length - 1] ?? '';
  return RESERVED_TOP_LEVEL_DOMAINS.has(tld);
}

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '').trim();
}

export function validateHostname(hostname: string): { valid: boolean; reason?: string } {
  if (!hostname) return { valid: false, reason: 'Hostname is empty' };
  if (hostname.length > 253) return { valid: false, reason: 'Hostname too long (max 253 chars)' };
  if (!HOSTNAME_REGEX.test(hostname)) return { valid: false, reason: 'Invalid hostname format' };
  const labels = hostname.split('.');
  for (const label of labels) {
    if (label.length === 0) return { valid: false, reason: 'Empty label in hostname' };
    if (label.length > 63) return { valid: false, reason: 'Label too long (max 63 chars)' };
  }
  return { valid: true };
}
