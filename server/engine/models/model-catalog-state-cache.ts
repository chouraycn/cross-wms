/**
 * 目录状态缓存 — 模型目录的状态缓存
 *
 * 缓存模型目录的各种状态，包括可用性、认证状态、
 * 健康状态等，避免重复计算。
 */

import { logger } from '../../logger.js';

export interface CatalogStateEntry {
  modelId: string;
  available: boolean;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheckedAt: number;
  lastUsedAt?: number;
  usageCount: number;
  errorCount: number;
  successCount: number;
  metadata?: Record<string, unknown>;
}

export interface CatalogStateCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
}

export class CatalogStateCache {
  private states = new Map<string, CatalogStateEntry>();
  private ttlMs: number;
  private maxEntries: number;
  private accessOrder: string[] = [];

  constructor(options: CatalogStateCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 1000;
  }

  get(modelId: string): CatalogStateEntry | undefined {
    const entry = this.states.get(modelId);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.states.delete(modelId);
      this.removeFromAccessOrder(modelId);
      return undefined;
    }

    this.touchAccessOrder(modelId);
    return entry;
  }

  set(modelId: string, state: Partial<CatalogStateEntry>): CatalogStateEntry {
    const existing = this.states.get(modelId);
    const entry: CatalogStateEntry = {
      modelId,
      available: false,
      authStatus: 'pending',
      healthStatus: 'unknown',
      lastCheckedAt: Date.now(),
      usageCount: 0,
      errorCount: 0,
      successCount: 0,
      ...existing,
      ...state,
    };

    this.states.set(modelId, entry);
    this.touchAccessOrder(modelId);
    this.evictIfNeeded();

    return entry;
  }

  has(modelId: string): boolean {
    const entry = this.states.get(modelId);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.states.delete(modelId);
      this.removeFromAccessOrder(modelId);
      return false;
    }
    return true;
  }

  delete(modelId: string): boolean {
    const existed = this.states.delete(modelId);
    if (existed) {
      this.removeFromAccessOrder(modelId);
    }
    return existed;
  }

  updateAuthStatus(
    modelId: string,
    authStatus: CatalogStateEntry['authStatus'],
  ): void {
    const entry = this.get(modelId);
    this.set(modelId, {
      ...entry,
      authStatus,
      available: authStatus === 'authenticated',
      lastCheckedAt: Date.now(),
    });
  }

  updateHealthStatus(
    modelId: string,
    healthStatus: CatalogStateEntry['healthStatus'],
  ): void {
    const entry = this.get(modelId);
    this.set(modelId, {
      ...entry,
      healthStatus,
      lastCheckedAt: Date.now(),
    });
  }

  recordSuccess(modelId: string): void {
    const entry = this.get(modelId);
    this.set(modelId, {
      ...entry,
      successCount: (entry?.successCount ?? 0) + 1,
      usageCount: (entry?.usageCount ?? 0) + 1,
      lastUsedAt: Date.now(),
      healthStatus: 'healthy',
    });
  }

  recordError(modelId: string): void {
    const entry = this.get(modelId);
    const errorCount = (entry?.errorCount ?? 0) + 1;
    const healthStatus = errorCount >= 5 ? 'unhealthy' : errorCount >= 2 ? 'degraded' : 'healthy';

    this.set(modelId, {
      ...entry,
      errorCount,
      usageCount: (entry?.usageCount ?? 0) + 1,
      lastUsedAt: Date.now(),
      healthStatus,
    });
  }

  invalidate(modelId: string): void {
    const entry = this.states.get(modelId);
    if (entry) {
      entry.lastCheckedAt = 0;
    }
  }

  invalidateAll(): void {
    for (const entry of this.states.values()) {
      entry.lastCheckedAt = 0;
    }
    logger.debug('[CatalogStateCache] 已失效所有缓存');
  }

  clear(): void {
    this.states.clear();
    this.accessOrder = [];
    logger.debug('[CatalogStateCache] 已清空缓存');
  }

  getAll(): CatalogStateEntry[] {
    return Array.from(this.states.values()).filter(e => !this.isExpired(e));
  }

  getByAuthStatus(
    status: CatalogStateEntry['authStatus'],
  ): CatalogStateEntry[] {
    return this.getAll().filter(e => e.authStatus === status);
  }

  getByHealthStatus(
    status: CatalogStateEntry['healthStatus'],
  ): CatalogStateEntry[] {
    return this.getAll().filter(e => e.healthStatus === status);
  }

  getAvailableModels(): string[] {
    return this.getAll().filter(e => e.available).map(e => e.modelId);
  }

  getStats(): {
    total: number;
    available: number;
    authenticated: number;
    healthy: number;
  } {
    const all = this.getAll();
    return {
      total: all.length,
      available: all.filter(e => e.available).length,
      authenticated: all.filter(e => e.authStatus === 'authenticated').length,
      healthy: all.filter(e => e.healthStatus === 'healthy').length,
    };
  }

  size(): number {
    return this.states.size;
  }

  private isExpired(entry: CatalogStateEntry): boolean {
    return Date.now() - entry.lastCheckedAt > this.ttlMs;
  }

  private touchAccessOrder(modelId: string): void {
    this.removeFromAccessOrder(modelId);
    this.accessOrder.push(modelId);
  }

  private removeFromAccessOrder(modelId: string): void {
    const index = this.accessOrder.indexOf(modelId);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictIfNeeded(): void {
    while (this.states.size > this.maxEntries) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.states.delete(oldest);
      } else {
        break;
      }
    }
  }
}

let globalCatalogStateCache: CatalogStateCache | null = null;

export function getCatalogStateCache(): CatalogStateCache {
  if (!globalCatalogStateCache) {
    globalCatalogStateCache = new CatalogStateCache();
  }
  return globalCatalogStateCache;
}
