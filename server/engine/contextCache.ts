/**
 * Context Window Cache — 上下文窗口缓存层
 *
 * 多级缓存设计，减少模型窗口大小重复查询，提升热路径效率。
 *
 * 缓存层级：
 * 1. L1 — 内存 LRU 缓存（进程内，最快）
 * 2. L2 — 持久化缓存（可选，跨进程共享）
 * 3. L3 — 后台预取刷新（主动更新热模型的窗口信息）
 *
 * 使用方式：
 *   import contextWindowCache from './contextCache.js';
 *   const window = await contextWindowCache.get(modelId, provider);
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 模型上下文窗口信息 */
export interface ModelContextWindowInfo {
  modelId: string;
  provider: string;
  contextWindow: number;
  maxTokens?: number;
  capabilities?: string[];
  source: 'cache' | 'config' | 'provider' | 'fallback';
  fetchedAt: number;
  ttl: number;
}

/** 缓存配置 */
export interface ContextCacheConfig {
  maxSize: number;
  defaultTtlMs: number;
  backgroundRefreshIntervalMs: number;
  backgroundRefreshThreshold: number;
}

/** LRU 缓存条目 */
interface CacheEntry {
  key: string;
  value: ModelContextWindowInfo;
  lastAccess: number;
}

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: ContextCacheConfig = {
  maxSize: 100,
  defaultTtlMs: 1000 * 60 * 60 * 24,
  backgroundRefreshIntervalMs: 1000 * 60 * 30,
  backgroundRefreshThreshold: 5,
};

const FALLBACK_CONTEXT_WINDOW = 8192;

// ===================== ContextWindowCache 类 =====================

export class ContextWindowCache {
  private config: ContextCacheConfig;
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[];
  private backgroundTimer: ReturnType<typeof setInterval> | null;
  private fetchProvider: ((modelId: string, provider: string) => Promise<ModelContextWindowInfo>) | null;

  constructor(config: Partial<ContextCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.accessOrder = [];
    this.backgroundTimer = null;
    this.fetchProvider = null;
  }

  // ===================== 配置 =====================

  configure(config: Partial<ContextCacheConfig>): void {
    this.config = { ...this.config, ...config };
    this.trimToSize();
  }

  setFetchProvider(
    provider: (modelId: string, provider: string) => Promise<ModelContextWindowInfo>,
  ): void {
    this.fetchProvider = provider;
  }

  // ===================== 核心 API =====================

  async get(
    modelId: string,
    provider: string,
    options?: { forceRefresh?: boolean },
  ): Promise<ModelContextWindowInfo> {
    const key = this.makeKey(modelId, provider);

    if (!options?.forceRefresh) {
      const cached = this.getFromCache(key);
      if (cached && !this.isExpired(cached)) {
        logger.debug(`[ContextCache] HIT: ${modelId}@${provider} = ${cached.contextWindow}`);
        return cached;
      }
    }

    const info = await this.fetchAndCache(modelId, provider, key);
    return info;
  }

  getSync(modelId: string, provider: string): ModelContextWindowInfo | null {
    const key = this.makeKey(modelId, provider);
    const cached = this.getFromCache(key);
    if (cached && !this.isExpired(cached)) {
      return cached;
    }
    return null;
  }

  set(info: ModelContextWindowInfo): void {
    const key = this.makeKey(info.modelId, info.provider);
    this.setCache(key, info);
  }

  invalidate(modelId: string, provider: string): boolean {
    const key = this.makeKey(modelId, provider);
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return existed;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.debug('[ContextCache] Cache cleared');
  }

  get size(): number {
    return this.cache.size;
  }

  get stats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
    };
  }

  // ===================== 后台刷新 =====================

  startBackgroundRefresh(): void {
    if (this.backgroundTimer) return;
    if (!this.fetchProvider) {
      logger.warn('[ContextCache] Cannot start background refresh: no fetch provider');
      return;
    }

    this.backgroundTimer = setInterval(() => {
      this.refreshHotEntries().catch((err) => {
        logger.warn('[ContextCache] Background refresh failed:', err);
      });
    }, this.config.backgroundRefreshIntervalMs);

    logger.info(
      `[ContextCache] Background refresh started (interval: ${this.config.backgroundRefreshIntervalMs / 1000}s)`,
    );
  }

  stopBackgroundRefresh(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
      logger.info('[ContextCache] Background refresh stopped');
    }
  }

  private async refreshHotEntries(): Promise<void> {
    if (!this.fetchProvider) return;

    const hotEntries = this.accessOrder
      .slice(0, this.config.backgroundRefreshThreshold)
      .map((key) => this.cache.get(key))
      .filter(Boolean) as CacheEntry[];

    if (hotEntries.length === 0) return;

    logger.debug(`[ContextCache] Refreshing ${hotEntries.length} hot entries...`);

    for (const entry of hotEntries) {
      try {
        const fresh = await this.fetchProvider(entry.value.modelId, entry.value.provider);
        this.setCache(entry.key, fresh);
      } catch (err) {
        logger.debug(
          `[ContextCache] Failed to refresh ${entry.value.modelId}@${entry.value.provider}:`,
          err,
        );
      }
    }
  }

  // ===================== 内部方法 =====================

  private makeKey(modelId: string, provider: string): string {
    return `${provider}:${modelId}`;
  }

  private getFromCache(key: string): ModelContextWindowInfo | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    entry.lastAccess = Date.now();
    this.updateAccessOrder(key);
    return { ...entry.value };
  }

  private setCache(key: string, value: ModelContextWindowInfo): void {
    const now = Date.now();
    const entry: CacheEntry = {
      key,
      value: { ...value, fetchedAt: now, ttl: this.config.defaultTtlMs },
      lastAccess: now,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.trimToSize();
  }

  private updateAccessOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.unshift(key);
  }

  private trimToSize(): void {
    while (this.cache.size > this.config.maxSize) {
      const oldestKey = this.accessOrder.pop();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  private isExpired(entry: ModelContextWindowInfo): boolean {
    const age = Date.now() - entry.fetchedAt;
    return age > entry.ttl;
  }

  private async fetchAndCache(
    modelId: string,
    provider: string,
    key: string,
  ): Promise<ModelContextWindowInfo> {
    if (this.fetchProvider) {
      try {
        const info = await this.fetchProvider(modelId, provider);
        this.setCache(key, info);
        logger.debug(`[ContextCache] FETCHED: ${modelId}@${provider} = ${info.contextWindow}`);
        return info;
      } catch (err) {
        logger.warn(`[ContextCache] Fetch failed for ${modelId}@${provider}, using fallback:`, err);
      }
    }

    const fallback: ModelContextWindowInfo = {
      modelId,
      provider,
      contextWindow: FALLBACK_CONTEXT_WINDOW,
      source: 'fallback',
      fetchedAt: Date.now(),
      ttl: this.config.defaultTtlMs,
    };

    this.setCache(key, fallback);
    return fallback;
  }
}

// ===================== 单例导出 =====================

const contextWindowCache = new ContextWindowCache();

export default contextWindowCache;
