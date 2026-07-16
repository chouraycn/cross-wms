import { logger } from '../../logger.js';

export interface ToolCacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt: number;
  createdAt: number;
  hitCount: number;
}

const cacheStore = new Map<string, ToolCacheEntry>();

export function getCachedTool<T = unknown>(key: string): T | undefined {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return undefined;
  }
  entry.hitCount++;
  return entry.value as T;
}

export function setCachedTool<T = unknown>(key: string, value: T, ttlMs: number = 60_000): void {
  cacheStore.set(key, {
    key,
    value,
    expiresAt: Date.now() + ttlMs,
    createdAt: Date.now(),
    hitCount: 0,
  });
}

export function invalidateToolCache(key: string): boolean {
  return cacheStore.delete(key);
}

export function invalidateToolCacheByPrefix(prefix: string): number {
  let count = 0;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
      count++;
    }
  }
  return count;
}

export function clearToolCache(): void {
  cacheStore.clear();
}

export function getToolCacheStats(): { size: number; totalHits: number } {
  let totalHits = 0;
  for (const entry of cacheStore.values()) {
    totalHits += entry.hitCount;
  }
  return { size: cacheStore.size, totalHits };
}

export function cleanupExpiredCache(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of cacheStore.entries()) {
    if (now > entry.expiresAt) {
      cacheStore.delete(key);
      removed++;
    }
  }
  if (removed > 0) logger.debug(`[Tools:Cache] Cleaned up ${removed} expired entries`);
  return removed;
}
