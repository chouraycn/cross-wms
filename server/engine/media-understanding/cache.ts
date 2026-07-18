/**
 * Media Analysis Cache — 媒体分析结果缓存
 *
 * 基于 LRU + TTL 的内存缓存，避免对同一媒体重复分析。
 */

import { logger } from '../../logger.js';
import { DEFAULT_CACHE_MAX_ENTRIES, DEFAULT_CACHE_TTL_MS } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  /** LRU 顺序计数器，越大越新 */
  order: number;
}

/** 生成缓存 key：基于输入标识 */
export function buildCacheKey(input: {
  path?: string;
  url?: string;
  buffer?: Buffer;
  fileName?: string;
  mime?: string;
}): string {
  const parts: string[] = [];
  if (input.path) parts.push(`path:${input.path}`);
  if (input.url) parts.push(`url:${input.url}`);
  if (input.buffer) parts.push(`buf:${input.buffer.length}:${simpleHash(input.buffer)}`);
  if (input.fileName) parts.push(`name:${input.fileName}`);
  if (input.mime) parts.push(`mime:${input.mime}`);
  return parts.join('|');
}

/** 对 Buffer 做简单哈希（非加密，仅用于缓存去重） */
function simpleHash(buffer: Buffer): string {
  let hash = 0;
  const step = Math.max(1, Math.floor(buffer.length / 1024));
  for (let i = 0; i < buffer.length; i += step) {
    hash = ((hash << 5) - hash + buffer[i]) | 0;
  }
  return (hash >>> 0).toString(16);
}

export class MediaAnalysisCache<T = unknown> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private counter = 0;
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(opts?: { maxEntries?: number; ttlMs?: number }) {
    this.maxEntries = opts?.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
    this.ttlMs = opts?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /** 获取缓存值，未命中或过期返回 undefined */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      logger.debug(`[MediaCache] expired key: ${key}`);
      return undefined;
    }
    entry.order = ++this.counter;
    return entry.value;
  }

  /** 写入缓存，超过容量时淘汰最久未使用 */
  set(key: string, value: T, ttlMs?: number): void {
    if (this.entries.size >= this.maxEntries) {
      this.evictLRU();
    }
    const expiresAt = Date.now() + (ttlMs ?? this.ttlMs);
    this.entries.set(key, { value, expiresAt, order: ++this.counter });
  }

  /** 是否存在且未过期 */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /** 删除指定 key */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** 清空所有缓存 */
  clear(): void {
    this.entries.clear();
    this.counter = 0;
  }

  /** 当前缓存数量 */
  get size(): number {
    return this.entries.size;
  }

  /** 清理所有过期条目 */
  pruneExpired(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`[MediaCache] pruned ${removed} expired entries`);
    }
    return removed;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestOrder = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.order < oldestOrder) {
        oldestOrder = entry.order;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.entries.delete(oldestKey);
      logger.debug(`[MediaCache] evicted LRU key: ${oldestKey}`);
    }
  }
}

/** 默认全局缓存实例 */
export const defaultMediaCache = new MediaAnalysisCache();
