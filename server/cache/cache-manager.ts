/**
 * Cache Manager — 缓存管理器
 *
 * 统一管理多个命名空间的缓存，提供统计和管理接口。
 */

import { LRUCache } from './lru-cache.js';
import type { CacheStats, CacheOptions } from './lru-cache.js';

export interface CacheNamespaceInfo {
  name: string;
  stats: CacheStats;
  options: {
    maxSize: number;
    defaultTTL: number;
    maxMemoryBytes: number;
  };
}

export interface CacheManagerStats {
  totalCaches: number;
  totalEntries: number;
  totalMemory: number;
  overallHitRate: number;
  namespaces: Record<string, CacheStats>;
}

type CacheNamespace = {
  cache: LRUCache<unknown>;
  options: Required<CacheOptions>;
};

class CacheManager {
  private caches: Map<string, CacheNamespace> = new Map();
  private defaultOptions: Required<CacheOptions> = {
    maxSize: 1000,
    defaultTTL: 5 * 60 * 1000,
    maxMemoryBytes: 50 * 1024 * 1024,
    resetStatsOnRead: false,
  };

  getCache<T = unknown>(name: string, options?: CacheOptions): LRUCache<T> {
    let namespace = this.caches.get(name);

    if (!namespace) {
      const mergedOptions = {
        ...this.defaultOptions,
        ...options,
      };

      namespace = {
        cache: new LRUCache<T>(mergedOptions) as LRUCache<unknown>,
        options: mergedOptions,
      };

      this.caches.set(name, namespace);
    }

    return namespace.cache as LRUCache<T>;
  }

  hasCache(name: string): boolean {
    return this.caches.has(name);
  }

  deleteCache(name: string): boolean {
    const namespace = this.caches.get(name);
    if (!namespace) return false;
    namespace.cache.clear();
    this.caches.delete(name);
    return true;
  }

  clearCache(name: string): boolean {
    const namespace = this.caches.get(name);
    if (!namespace) return false;
    namespace.cache.clear();
    return true;
  }

  clearAll(): void {
    for (const namespace of this.caches.values()) {
      namespace.cache.clear();
    }
  }

  getStats(): CacheManagerStats {
    const namespaces: Record<string, CacheStats> = {};
    let totalEntries = 0;
    let totalMemory = 0;
    let totalHits = 0;
    let totalMisses = 0;

    for (const [name, namespace] of this.caches) {
      const stats = namespace.cache.getStats();
      namespaces[name] = stats;
      totalEntries += stats.totalEntries;
      totalMemory += stats.memoryEstimate;
      totalHits += stats.hitCount;
      totalMisses += stats.missCount;
    }

    const totalRequests = totalHits + totalMisses;
    const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    return {
      totalCaches: this.caches.size,
      totalEntries,
      totalMemory,
      overallHitRate,
      namespaces,
    };
  }

  getCacheNames(): string[] {
    return Array.from(this.caches.keys());
  }

  getCacheInfo(name: string): CacheNamespaceInfo | null {
    const namespace = this.caches.get(name);
    if (!namespace) return null;

    return {
      name,
      stats: namespace.cache.getStats(),
      options: namespace.options,
    };
  }

  pruneAllExpired(): number {
    let totalRemoved = 0;
    for (const namespace of this.caches.values()) {
      totalRemoved += namespace.cache.pruneExpired();
    }
    return totalRemoved;
  }

  resetAllStats(): void {
    for (const namespace of this.caches.values()) {
      namespace.cache.resetStats();
    }
  }
}

export const cacheManager = new CacheManager();

// 预定义常用缓存命名空间
export const CACHE_NAMESPACES = {
  PLUGINS: 'plugins',
  EXTENSIONS: 'extensions',
  MODELS: 'models',
  MEMORY: 'memory',
  EMBEDDINGS: 'embeddings',
  MESSAGES: 'messages',
  CONFIG: 'config',
  METRICS: 'metrics',
  AUDIT: 'audit',
  API_RESPONSES: 'api-responses',
} as const;

export type CacheNamespaceName = typeof CACHE_NAMESPACES[keyof typeof CACHE_NAMESPACES];

// 便捷方法
export function getPluginCache(): LRUCache<unknown> {
  return cacheManager.getCache(CACHE_NAMESPACES.PLUGINS, {
    maxSize: 500,
    defaultTTL: 10 * 60 * 1000,
  });
}

export function getModelCache(): LRUCache<unknown> {
  return cacheManager.getCache(CACHE_NAMESPACES.MODELS, {
    maxSize: 200,
    defaultTTL: 30 * 60 * 1000,
  });
}

export function getMemoryCache(): LRUCache<unknown> {
  return cacheManager.getCache(CACHE_NAMESPACES.MEMORY, {
    maxSize: 1000,
    defaultTTL: 5 * 60 * 1000,
  });
}

export function getEmbeddingCache(): LRUCache<unknown> {
  return cacheManager.getCache(CACHE_NAMESPACES.EMBEDDINGS, {
    maxSize: 10000,
    defaultTTL: 60 * 60 * 1000,
    maxMemoryBytes: 100 * 1024 * 1024,
  });
}

// 定期清理过期缓存
setInterval(() => {
  cacheManager.pruneAllExpired();
}, 60 * 1000);
