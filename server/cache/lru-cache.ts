/**
 * LRU Cache with TTL — 带 TTL 的 LRU 缓存
 *
 * 支持：
 * - LRU 淘汰策略（最近最少使用）
 * - TTL 过期
 * - 最大容量限制
 * - 缓存统计
 * - 键空间通知
 */

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  size: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  hitRate: number;
  totalEntries: number;
  memoryEstimate: number;
}

export interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
  maxMemoryBytes?: number;
  resetStatsOnRead?: boolean;
}

type CacheMap<T> = Map<string, CacheEntry<T>>;

export class LRUCache<T = unknown> {
  private cache: CacheMap<T> = new Map();
  private maxSize: number;
  private defaultTTL: number;
  private maxMemoryBytes: number;

  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private totalMemory = 0;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTTL = options.defaultTTL ?? 5 * 60 * 1000;
    this.maxMemoryBytes = options.maxMemoryBytes ?? 50 * 1024 * 1024;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // 检查是否过期
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.totalMemory -= entry.size;
      this.evictionCount++;
      this.missCount++;
      return undefined;
    }

    // 更新访问记录
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();

    // LRU：删除再添加，移到最后
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hitCount++;
    return entry.value;
  }

  getWithMetadata(key: string): CacheEntry<T> | undefined {
    const value = this.get(key);
    if (value === undefined) return undefined;
    return this.cache.get(key);
  }

  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const effectiveTTL = ttl ?? this.defaultTTL;
    const estimatedSize = this.estimateSize(value);

    // 检查是否已存在
    const existing = this.cache.get(key);
    if (existing) {
      this.totalMemory -= existing.size;
      this.cache.delete(key);
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt: now + effectiveTTL,
      accessCount: 0,
      lastAccessedAt: now,
      size: estimatedSize,
    };

    this.cache.set(key, entry);
    this.totalMemory += estimatedSize;

    // 检查容量
    this.enforceLimits();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.evictionCount++;
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    this.cache.delete(key);
    this.totalMemory -= entry.size;
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.totalMemory = 0;
  }

  keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    this.cleanupExpired();
    return Array.from(this.cache.values()).map((e) => e.value);
  }

  entries(): Array<[string, T]> {
    this.cleanupExpired();
    return Array.from(this.cache.entries()).map(([k, e]) => [k, e.value]);
  }

  size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  getStats(): CacheStats {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
      totalEntries: this.cache.size,
      memoryEstimate: this.totalMemory,
    };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  pruneExpired(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        this.totalMemory -= entry.size;
        removed++;
        this.evictionCount++;
      }
    }
    return removed;
  }

  private enforceLimits(): void {
    // 清理过期
    this.cleanupExpired();

    // 检查数量限制
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      const entry = this.cache.get(firstKey);
      if (entry) {
        this.totalMemory -= entry.size;
      }
      this.cache.delete(firstKey);
      this.evictionCount++;
    }

    // 检查内存限制
    while (this.totalMemory > this.maxMemoryBytes && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      const entry = this.cache.get(firstKey);
      if (entry) {
        this.totalMemory -= entry.size;
      }
      this.cache.delete(firstKey);
      this.evictionCount++;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        this.totalMemory -= entry.size;
        this.evictionCount++;
      }
    }
  }

  private estimateSize(value: T): number {
    if (typeof value === 'string') {
      return value.length * 2;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8;
    }
    if (value === null || value === undefined) {
      return 8;
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 1024;
      }
    }
    return 1024;
  }

  async getOrSet(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  getMultiple(keys: string[]): Record<string, T> {
    const result: Record<string, T> = {};
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  setMultiple(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
  }

  deleteMultiple(keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      const entry = this.cache.get(key);
      if (entry) {
        this.totalMemory -= entry.size;
      }
      this.cache.delete(key);
      this.evictionCount++;
    }

    return keysToDelete.length;
  }
}
