/**
 * 密钥运行时模块
 *
 * 提供运行时密钥访问能力：
 * - 带 TTL 的内存缓存
 * - 通过 store 的 onCacheInvalidate 回调自动失效
 * - 运行时配置快照（sessionId / activeSecrets）
 * - 统计信息（命中率、访问次数）
 *
 * 使用方式：
 *   const runtime = new SecretsRuntime({ registry, cacheTtlMs: 60_000 });
 *   runtime.setSession('session-1');
 *   const value = runtime.get({ provider: 'env', key: 'API_KEY' });
 */

import { logger } from '../../logger.js';
import { onCacheInvalidate } from './store.js';
import {
  resolveSecretRef,
  resolveSecretRefAsync,
  resolveTemplate as resolveTemplateBase,
  resolveWithFallback,
} from './resolver.js';
import type { ProviderRegistry } from './provider.js';
import type {
  SecretRef,
  SecretCacheEntry,
  SecretsRuntimeConfig,
  SecretsStats,
  ResolvedSecret,
  SecretProvider,
} from './types.js';

/** 默认缓存 TTL：5 分钟 */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** 运行时选项 */
export interface SecretsRuntimeOptions {
  /** Provider 注册表 */
  registry: ProviderRegistry;
  /** 缓存 TTL（毫秒） */
  cacheTtlMs?: number;
  /** 访问来源标识 */
  source?: string;
  /** 是否启用缓存（默认 true） */
  enableCache?: boolean;
}

/** 统计计数器 */
interface RuntimeStats {
  hits: number;
  misses: number;
  resolves: number;
  errors: number;
  invalidations: number;
  lastUpdated: number;
}

/**
 * 密钥运行时
 *
 * 封装解析 + 缓存 + 失效 + 统计能力，是上层应用访问密钥的统一入口。
 */
export class SecretsRuntime {
  private readonly registry: ProviderRegistry;
  private readonly cacheTtlMs: number;
  private readonly source: string;
  private readonly enableCache: boolean;
  private readonly cache = new Map<string, SecretCacheEntry>();
  private readonly stats: RuntimeStats = {
    hits: 0,
    misses: 0,
    resolves: 0,
    errors: 0,
    invalidations: 0,
    lastUpdated: Date.now(),
  };
  private sessionId: string | undefined;
  private activeSecrets: SecretRef[] = [];
  private snapshotTime = 0;
  private invalidateRegistered = false;

  constructor(options: SecretsRuntimeOptions) {
    this.registry = options.registry;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.source = options.source ?? 'runtime';
    this.enableCache = options.enableCache ?? true;
  }

  /**
   * 设置当前会话上下文
   */
  setSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.snapshotTime = Date.now();
    logger.debug('[SecretsRuntime] 会话已设置', { sessionId });
  }

  /**
   * 注册活跃密钥列表（用于快照与审计）
   */
  setActiveSecrets(refs: SecretRef[]): void {
    this.activeSecrets = [...refs];
    this.snapshotTime = Date.now();
  }

  /**
   * 获取当前运行时配置快照
   */
  snapshot(): SecretsRuntimeConfig {
    return {
      activeSecrets: [...this.activeSecrets],
      snapshotTime: this.snapshotTime || Date.now(),
      sessionId: this.sessionId ?? '',
    };
  }

  /**
   * 同步获取密钥（带缓存）
   */
  get(ref: SecretRef): string | null {
    const cacheKey = this.cacheKey(ref);
    const cached = this.getFromCache(cacheKey);
    if (cached !== null) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;
    const resolved = resolveSecretRef(ref, this.registry, this.source);
    if (resolved === null) {
      this.stats.errors++;
      return null;
    }

    this.stats.resolves++;
    this.putToCache(cacheKey, resolved.value);
    return resolved.value;
  }

  /**
   * 异步获取密钥（带缓存，支持 KMS / exec 等异步 provider）
   */
  async getAsync(ref: SecretRef): Promise<string | null> {
    const cacheKey = this.cacheKey(ref);
    const cached = this.getFromCache(cacheKey);
    if (cached !== null) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;
    const resolved = await resolveSecretRefAsync(ref, this.registry, this.source);
    if (resolved === null) {
      this.stats.errors++;
      return null;
    }

    this.stats.resolves++;
    this.putToCache(cacheKey, resolved.value);
    return resolved.value;
  }

  /**
   * 按回退链获取密钥
   */
  getWithFallback(refs: SecretRef[]): string | null {
    if (refs.length === 0) return null;

    // 先尝试全部命中缓存
    for (const ref of refs) {
      const cacheKey = this.cacheKey(ref);
      const cached = this.getFromCache(cacheKey);
      if (cached !== null) {
        this.stats.hits++;
        return cached;
      }
    }

    this.stats.misses++;
    const resolved = resolveWithFallback(refs, this.registry, this.source);
    if (resolved === null) {
      this.stats.errors++;
      return null;
    }

    this.stats.resolves++;
    this.putToCache(this.cacheKey(resolved.ref), resolved.value);
    return resolved.value;
  }

  /**
   * 解析模板字符串（${secret:provider:key}）
   *
   * 注意：模板内的 KMS / exec provider 无法同步解析，占位符将保留。
   */
  resolveTemplate(template: string): string {
    return resolveTemplateBase(template, this.registry, this.source);
  }

  /**
   * 失效单个缓存条目
   */
  invalidate(provider: SecretProvider, key: string): void {
    const cacheKey = `${provider}:${key}`;
    if (this.cache.delete(cacheKey)) {
      this.stats.invalidations++;
      logger.debug('[SecretsRuntime] 缓存已失效', { provider, key });
    }
  }

  /**
   * 失效所有缓存
   */
  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += size;
    logger.debug('[SecretsRuntime] 全部缓存已失效', { size });
  }

  /**
   * 注册到 store 的缓存失效回调（仅在首次调用时注册）
   *
   * 当 store 中的密钥发生增删改时，自动失效对应缓存。
   */
  registerStoreInvalidation(): void {
    if (this.invalidateRegistered) return;
    onCacheInvalidate((provider, key) => this.invalidate(provider, key));
    this.invalidateRegistered = true;
  }

  /**
   * 获取统计信息
   */
  getStats(): SecretsStats {
    const total = this.stats.hits + this.stats.misses;
    const cacheHitRate = total > 0 ? this.stats.hits / total : 0;
    return {
      totalSecrets: this.cache.size,
      byProvider: this.countByProvider(),
      byType: {},
      cacheHitRate,
      lastUpdated: this.stats.lastUpdated,
    };
  }

  /**
   * 获取原始运行时统计（含 resolves / errors / invalidations）
   */
  getRawStats(): RuntimeStats {
    return { ...this.stats };
  }

  // ============== 内部方法 ==============

  private cacheKey(ref: SecretRef): string {
    return `${ref.provider}:${ref.key}`;
  }

  private getFromCache(cacheKey: string): string | null {
    if (!this.enableCache) return null;
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    const now = Date.now();
    if (entry.expiresAt !== undefined && now >= entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.value;
  }

  private putToCache(cacheKey: string, value: string): void {
    if (!this.enableCache) return;
    const now = Date.now();
    const entry: SecretCacheEntry = {
      value,
      cachedAt: now,
      expiresAt: this.cacheTtlMs > 0 ? now + this.cacheTtlMs : undefined,
    };
    this.cache.set(cacheKey, entry);
    this.stats.lastUpdated = now;
  }

  private countByProvider(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const key of this.cache.keys()) {
      const provider = key.split(':')[0];
      counts[provider] = (counts[provider] ?? 0) + 1;
    }
    return counts;
  }
}

/**
 * 判断解析结果是否命中缓存
 */
export function isResolvedFromCache(resolved: ResolvedSecret): boolean {
  return resolved.cached === true;
}

/** 默认缓存 TTL 常量（导出供测试与外部配置引用） */
export const DEFAULT_RUNTIME_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;
