import { logger } from '../../logger.js';

export const DEFAULT_ACCOUNT_ID = 'default';

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;
const ACCOUNT_ID_CACHE_MAX = 512;

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const normalizeAccountIdCache = new Map<string, string>();
const normalizeOptionalAccountIdCache = new Map<string, string | undefined>();

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function isBlockedObjectKey(value: string): boolean {
  return BLOCKED_KEYS.has(value.toLowerCase());
}

function canonicalizeAccountId(value: string): string {
  const normalized = normalizeLowercaseStringOrEmpty(value);
  if (VALID_ID_RE.test(value)) {
    return normalized;
  }
  return normalized
    .replace(INVALID_CHARS_RE, '-')
    .replace(LEADING_DASH_RE, '')
    .replace(TRAILING_DASH_RE, '')
    .slice(0, 64);
}

function normalizeCanonicalAccountId(value: string): string | undefined {
  const canonical = canonicalizeAccountId(value);
  if (!canonical || isBlockedObjectKey(canonical)) {
    return undefined;
  }
  return canonical;
}

function setNormalizeCache<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.set(key, value);
  if (cache.size <= ACCOUNT_ID_CACHE_MAX) {
    return;
  }
  const oldest = cache.keys().next();
  if (!oldest.done) {
    cache.delete(oldest.value);
  }
}

export function normalizeAccountId(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return DEFAULT_ACCOUNT_ID;
  }
  const cached = normalizeAccountIdCache.get(trimmed);
  if (cached) {
    return cached;
  }
  const normalized = normalizeCanonicalAccountId(trimmed) || DEFAULT_ACCOUNT_ID;
  setNormalizeCache(normalizeAccountIdCache, trimmed, normalized);
  logger.debug(`[Routing:AccountId] Normalized account id: ${trimmed} -> ${normalized}`);
  return normalized;
}

export function normalizeOptionalAccountId(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return undefined;
  }
  if (normalizeOptionalAccountIdCache.has(trimmed)) {
    return normalizeOptionalAccountIdCache.get(trimmed);
  }
  const normalized = normalizeCanonicalAccountId(trimmed) || undefined;
  setNormalizeCache(normalizeOptionalAccountIdCache, trimmed, normalized);
  return normalized;
}

export function isValidAccountId(value: string | undefined | null): boolean {
  const trimmed = (value ?? '').trim();
  return Boolean(trimmed) && VALID_ID_RE.test(trimmed);
}
