import { logger } from '../../logger.js';

export interface DedupeOptions {
  keyFn?: (item: any) => string;
  keepFirst?: boolean;
  minLength?: number;
}

export function deduplicate<T>(items: T[], options: DedupeOptions = {}): T[] {
  const { keyFn, keepFirst = true, minLength = 1 } = options;
  
  const seen = new Set<string>();
  const result: T[] = [];
  
  const effectiveKeyFn = keyFn ?? ((item: any) => JSON.stringify(item));
  
  for (const item of items) {
    const key = effectiveKeyFn(item);
    
    if (key.length < minLength) {
      continue;
    }
    
    if (seen.has(key)) {
      if (!keepFirst) {
        const idx = result.findIndex(i => effectiveKeyFn(i) === key);
        if (idx !== -1) {
          result.splice(idx, 1);
        }
        result.push(item);
      }
      continue;
    }
    
    seen.add(key);
    result.push(item);
  }
  
  logger.debug(`[infra:Dedupe] Reduced from ${items.length} to ${result.length} items`);
  
  return result;
}

export function deduplicateStrings(strings: string[], minLength: number = 1): string[] {
  return deduplicate(strings, {
    keyFn: (s: any) => String(s),
    minLength,
  });
}

export function deduplicateByProperty<T, K extends keyof T>(
  items: T[],
  prop: K
): T[] {
  return deduplicate(items, {
    keyFn: (item: any) => String((item as T)[prop]),
  });
}

export function createDedupeFilter<T>(
  options: DedupeOptions = {}
): (item: T) => boolean {
  const seen = new Set<string>();
  const { keyFn, minLength = 1 } = options;
  
  const effectiveKeyFn = keyFn ?? ((item: any) => JSON.stringify(item));
  
  return (item: T) => {
    const key = effectiveKeyFn(item);
    
    if (key.length < minLength) {
      return true;
    }
    
    if (seen.has(key)) {
      return false;
    }
    
    seen.add(key);
    return true;
  };
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const resolveGlobalDedupeCache: (...args: any[]) => any = undefined as unknown as (...args: any[]) => any;

// openclaw compat: bounded in-memory dedupe cache with optional TTL expiry
export interface DedupeCacheOptions {
  ttlMs?: number;
  maxSize?: number;
}
export interface DedupeCache {
  has(key: string): boolean;
  add(key: string): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}
export function createDedupeCache(options: DedupeCacheOptions): DedupeCache {
  const ttlMs = Math.max(0, options.ttlMs ?? 0);
  const maxSize = Math.max(0, options.maxSize ?? 0);
  const cache = new Map<string, number>();
  const now = () => Date.now();
  const prune = (t: number) => {
    if (ttlMs > 0) {
      for (const [k, ts] of cache) {
        if (t - ts > ttlMs) {
          cache.delete(k);
        }
      }
    }
    if (maxSize > 0 && cache.size > maxSize) {
      const oldest = [...cache.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < cache.size - maxSize; i++) {
        cache.delete(oldest[i][0]);
      }
    }
  };
  return {
    has(key: string) {
      const t = now();
      prune(t);
      return cache.has(key);
    },
    add(key: string) {
      const t = now();
      prune(t);
      cache.set(key, t);
    },
    delete(key: string) {
      cache.delete(key);
    },
    clear() {
      cache.clear();
    },
    size() {
      return cache.size;
    },
  };
}
