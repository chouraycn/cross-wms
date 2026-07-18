// 移植自 openclaw/src/config/cache-utils.ts
// 提供带文件系统新鲜度检查的配置缓存助手。
//
// 降级说明：源文件依赖 ../infra/parse-finite-number.js 的 parseStrictNonNegativeInteger。
// 此处内联等价实现。
import fs from 'node:fs';

/** 内联降级实现：严格解析非负整数，无效时返回 undefined。 */
function parseStrictNonNegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 从 env 覆盖解析缓存 TTL，除非覆盖精确，否则回退。 */
export function resolveCacheTtlMs(params: {
  envValue: string | undefined;
  defaultTtlMs: number;
}): number {
  const { envValue, defaultTtlMs } = params;
  if (envValue) {
    const parsed = parseStrictNonNegativeInteger(envValue);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return defaultTtlMs;
}

/** 返回 TTL 是否保持缓存读写活跃。 */
export function isCacheEnabled(ttlMs: number): boolean {
  return ttlMs > 0;
}

type CacheTtlResolver = number | (() => number);
type CachePruneIntervalResolver = number | ((ttlMs: number) => number);

type ExpiringMapCacheEntry<TValue> = {
  storedAt: number;
  value: TValue;
};

type ExpiringMapCache<TKey, TValue> = {
  get: (key: TKey) => TValue | undefined;
  set: (key: TKey, value: TValue) => void;
  delete: (key: TKey) => void;
  clear: () => void;
  keys: () => TKey[];
  size: () => number;
  pruneExpired: () => void;
};

function resolveCacheNumeric(value: CacheTtlResolver): number {
  return typeof value === 'function' ? value() : value;
}

function resolvePruneIntervalMs(
  ttlMs: number,
  pruneIntervalMs: CachePruneIntervalResolver | undefined,
): number {
  if (typeof pruneIntervalMs === 'function') {
    return Math.max(0, Math.floor(pruneIntervalMs(ttlMs)));
  }
  if (typeof pruneIntervalMs === 'number') {
    return Math.max(0, Math.floor(pruneIntervalMs));
  }
  return ttlMs;
}

function isCacheEntryExpired(storedAt: number, now: number, ttlMs: number): boolean {
  return now - storedAt > ttlMs;
}

/** 创建一个带动态 TTL 和显式清理钩子的小型同步 map 缓存。 */
export function createExpiringMapCache<TKey, TValue>(options: {
  ttlMs: CacheTtlResolver;
  pruneIntervalMs?: CachePruneIntervalResolver;
  clock?: () => number;
}): ExpiringMapCache<TKey, TValue> {
  const cache = new Map<TKey, ExpiringMapCacheEntry<TValue>>();
  const now = options.clock ?? Date.now;
  let lastPruneAt = 0;

  function getTtlMs(): number {
    // 每次操作都重新读取 TTL，这样调用方可以在不重建缓存对象的情况下禁用或缩小缓存。
    return Math.max(0, Math.floor(resolveCacheNumeric(options.ttlMs)));
  }

  function maybePruneExpiredEntries(nowMs: number, ttlMs: number): void {
    if (!isCacheEnabled(ttlMs)) {
      return;
    }
    // 清理是机会式的；单次读仍检查过期，因此跳过的清扫不会返回过期值。
    if (nowMs - lastPruneAt < resolvePruneIntervalMs(ttlMs, options.pruneIntervalMs)) {
      return;
    }
    for (const [key, entry] of cache.entries()) {
      if (isCacheEntryExpired(entry.storedAt, nowMs, ttlMs)) {
        cache.delete(key);
      }
    }
    lastPruneAt = nowMs;
  }

  return {
    get: (key) => {
      const ttlMs = getTtlMs();
      if (!isCacheEnabled(ttlMs)) {
        return undefined;
      }
      const nowMs = now();
      maybePruneExpiredEntries(nowMs, ttlMs);
      const entry = cache.get(key);
      if (!entry) {
        return undefined;
      }
      if (isCacheEntryExpired(entry.storedAt, nowMs, ttlMs)) {
        cache.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set: (key, value) => {
      const ttlMs = getTtlMs();
      if (!isCacheEnabled(ttlMs)) {
        return;
      }
      const nowMs = now();
      maybePruneExpiredEntries(nowMs, ttlMs);
      cache.set(key, {
        storedAt: nowMs,
        value,
      });
    },
    delete: (key) => {
      cache.delete(key);
    },
    clear: () => {
      cache.clear();
      lastPruneAt = 0;
    },
    keys: () => [...cache.keys()],
    size: () => cache.size,
    pruneExpired: () => {
      const ttlMs = getTtlMs();
      if (!isCacheEnabled(ttlMs)) {
        return;
      }
      const nowMs = now();
      for (const [key, entry] of cache.entries()) {
        if (isCacheEntryExpired(entry.storedAt, nowMs, ttlMs)) {
          cache.delete(key);
        }
      }
      lastPruneAt = nowMs;
    },
  };
}

type FileStatSnapshot = {
  mtimeMs: number;
  sizeBytes: number;
};

/** 捕获缓存失效使用的文件属性，不暴露 fs.Stats。 */
export function getFileStatSnapshot(filePath: string): FileStatSnapshot | undefined {
  try {
    const stats = fs.statSync(filePath);
    return {
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
    };
  } catch {
    return undefined;
  }
}
