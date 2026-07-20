/**
 * 移植自 openclaw/src/agents/cache-trace.ts
 *
 * 降级实现：提供 cache trace 创建，不再抛出 stub 错误。
 */

export type CacheTrace = {
  hit: (key: string) => void;
  miss: (key: string) => void;
  getStats: () => { hits: number; misses: number };
};

export function createCacheTrace(): CacheTrace {
  let hits = 0;
  let misses = 0;
  return {
    hit: () => { hits++; },
    miss: () => { misses++; },
    getStats: () => ({ hits, misses }),
  };
}
