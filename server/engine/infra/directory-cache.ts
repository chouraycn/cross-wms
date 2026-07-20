// 移植自 openclaw/src/infra/directory-cache.ts

export type DirectoryCacheKey = {
  channel: string;
  accountId?: string;
  query?: string;
};

/** Builds a cache key for directory lookups. */
export function buildDirectoryCacheKey(params: DirectoryCacheKey): string {
  const parts = [params.channel];
  if (params.accountId) parts.push(params.accountId);
  if (params.query) parts.push(params.query);
  return parts.join("::");
}

/** Simple in-memory directory cache. */
export class DirectoryCache<T = unknown> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 300_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
}
