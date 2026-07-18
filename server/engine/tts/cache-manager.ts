/**
 * 缓存管理 — 文本到音频的 LRU 缓存。
 *
 * 参考 openclaw status-config 的 maxTextLength 约束与 server/cache/lru-cache.ts 的
 * LRU 语义，针对 TTS 场景精简：按 (text + provider + voice + format) 哈希作为键，
 * 同时受条目数与字节数上限约束，采用 Map 插入顺序实现 LRU 淘汰。
 */

import { createHash } from 'node:crypto';
import type { CacheStats, TTSResult } from './types.js';

/** 缓存构造选项。 */
export interface TTSCacheOptions {
  maxEntries?: number;
  maxBytes?: number;
  ttlMs?: number;
}

interface CacheEntry {
  result: TTSResult;
  bytes: number;
  expiresAt: number;
}

/**
 * 计算 TTS 结果的字节占用，主要来自音频 Buffer。
 */
function estimateEntryBytes(result: TTSResult): number {
  return result.audio.length + 256;
}

/**
 * 基于合成参数生成稳定的缓存键。
 * 使用 sha256 避免长文本作为键的内存开销与碰撞。
 */
export function buildCacheKey(
  text: string,
  provider: string,
  voice: string,
  format: string,
): string {
  const raw = `${provider}|${voice}|${format}|${text}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** TTS 专用 LRU 缓存。 */
export class TTSCacheManager {
  private store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private totalBytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: TTSCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;
  }

  /** 查询缓存结果；命中时刷新 LRU 顺序。 */
  get(key: string): TTSResult | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.removeEntry(key);
      this.misses++;
      return undefined;
    }
    // LRU 刷新：删除后重新插入至末尾
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.result;
  }

  /** 写入缓存结果。 */
  set(result: TTSResult, keyOverride?: string): string {
    const key =
      keyOverride ??
      buildCacheKey(result.audio.toString('hex'), result.provider, result.voice, result.format);
    // 不允许缓存空音频，避免污染缓存
    if (!result.audio || result.audio.length === 0) return key;

    const existing = this.store.get(key);
    if (existing) {
      this.totalBytes -= existing.bytes;
      this.store.delete(key);
    }

    const bytes = estimateEntryBytes(result);
    const entry: CacheEntry = {
      result,
      bytes,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.store.set(key, entry);
    this.totalBytes += bytes;
    this.enforceLimits();
    return key;
  }

  /** 便捷写入：自动从合成参数生成键。 */
  setWithKey(
    text: string,
    provider: string,
    voice: string,
    format: string,
    result: TTSResult,
  ): string {
    const key = buildCacheKey(text, provider, voice, format);
    this.set(result, key);
    return key;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.removeEntry(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.removeEntry(key);
  }

  clear(): void {
    this.store.clear();
    this.totalBytes = 0;
  }

  /** 返回缓存统计快照。 */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      bytes: this.totalBytes,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /** 重置命中/未命中计数，不影响缓存内容。 */
  resetCounters(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /** 主动清理已过期条目，返回清理数量。 */
  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) {
        this.removeEntry(key);
        removed++;
      }
    }
    return removed;
  }

  private removeEntry(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    this.store.delete(key);
    this.totalBytes -= entry.bytes;
    return true;
  }

  private enforceLimits(): void {
    // 条目数上限
    while (this.store.size > this.maxEntries) {
      this.evictOldest();
    }
    // 字节数上限
    while (this.totalBytes > this.maxBytes && this.store.size > 0) {
      this.evictOldest();
    }
  }

  private evictOldest(): void {
    const firstKey = this.store.keys().next().value;
    if (firstKey === undefined) return;
    this.removeEntry(firstKey);
    this.evictions++;
  }
}
