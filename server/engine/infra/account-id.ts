/**
 * 路由 account id 辅助 — 规范化 account 标识符用于路由匹配
 *
 * Account id 是 config/session 键，不是显示名。将它们规范化为短小写安全键，
 * 并拒绝类似原型的对象键。
 *
 * 参考 openclaw/src/routing/account-id.ts
 */
import { isBlockedObjectKey } from "./prototype-keys.js";

export const DEFAULT_ACCOUNT_ID = "default";

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;
const ACCOUNT_ID_CACHE_MAX = 512;

const normalizeAccountIdCache = new Map<string, string>();
const normalizeOptionalAccountIdCache = new Map<string, string | undefined>();

function normalizeLowercaseStringOrEmpty(value: string): string {
  return value.trim().toLowerCase();
}

function canonicalizeAccountId(value: string): string {
  const normalized = normalizeLowercaseStringOrEmpty(value);
  if (VALID_ID_RE.test(value)) {
    return normalized;
  }
  return normalized
    .replace(INVALID_CHARS_RE, "-")
    .replace(LEADING_DASH_RE, "")
    .replace(TRAILING_DASH_RE, "")
    .slice(0, 64);
}

function normalizeCanonicalAccountId(value: string): string | undefined {
  const canonical = canonicalizeAccountId(value);
  if (!canonical || isBlockedObjectKey(canonical)) {
    return undefined;
  }
  return canonical;
}

export function normalizeAccountId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_ACCOUNT_ID;
  }
  const cached = normalizeAccountIdCache.get(trimmed);
  if (cached) {
    return cached;
  }
  const normalized = normalizeCanonicalAccountId(trimmed) || DEFAULT_ACCOUNT_ID;
  setNormalizeCache(normalizeAccountIdCache, trimmed, normalized);
  return normalized;
}

// 可选变体用于 absence 有意义的 config 字段。无效 id 返回 undefined
// 而非静默选择 default account。
export function normalizeOptionalAccountId(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim();
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

function setNormalizeCache<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.set(key, value);
  if (cache.size <= ACCOUNT_ID_CACHE_MAX) {
    return;
  }
  // 有界 FIFO 缓存避免来自用户/通道输入的无界增长，
  // 同时让热 account id 在路由过程中保持低成本。
  const oldest = cache.keys().next();
  if (!oldest.done) {
    cache.delete(oldest.value);
  }
}
