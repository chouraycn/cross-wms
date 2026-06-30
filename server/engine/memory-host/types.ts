/**
 * Memory Host - 记忆主机抽象层
 *
 * 提供标准化的记忆存储接口，包装底层存储实现（向量数据库、SQLite、内存等）
 * 参考 OpenClaw 的 Memory Host 插件化架构
 */

import { logger } from '../../logger.js';

/** 记忆条目 */
export interface MemoryEntry {
  id: string;
  sessionId: string;
  content: string;
  embedding?: Float32Array;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  sizeBytes: number;
  importanceScore?: number;
}

/** 记忆搜索选项 */
export interface MemorySearchOptions {
  query?: string;
  topK?: number;
  minScore?: number;
  includeEmbedding?: boolean;
  filter?: Record<string, unknown>;
  timeRange?: {
    from?: number;
    to?: number;
  };
  hybridWeights?: {
    vector: number;
    text: number;
  };
  mmr?: {
    enabled: boolean;
    lambda: number;
  };
}

/** 记忆搜索结果 */
export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  rank: number;
}

/** 记忆统计 */
export interface MemoryHostStats {
  totalEntries: number;
  totalBytes: number;
  sessionCount: number;
  totalSearches: number;
  cacheHits: number;
  cacheMisses: number;
  avgSearchTimeMs: number;
}

/** 记忆主机配置 */
export interface MemoryHostConfig {
  hostId: string;
  displayName: string;
  description?: string;
  maxEntries?: number;
  maxBytes?: number;
  defaultTopK: number;
}

/**
 * 基础记忆主机抽象类
 */
export abstract class BaseMemoryHost {
  abstract readonly config: MemoryHostConfig;

  /** 初始化 */
  abstract init(): Promise<void>;

  /** 添加记忆 */
  abstract add(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'sizeBytes'>): Promise<MemoryEntry>;

  /** 批量添加记忆 */
  abstract addBatch(entries: Array<Omit<MemoryEntry, 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'sizeBytes'>>): Promise<MemoryEntry[]>;

  /** 获取记忆 */
  abstract get(id: string): Promise<MemoryEntry | null>;

  /** 更新记忆 */
  abstract update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'importanceScore'>>): Promise<MemoryEntry | null>;

  /** 删除记忆 */
  abstract delete(id: string): Promise<boolean>;

  /** 搜索记忆 */
  abstract search(query: string, options?: Partial<MemorySearchOptions>): Promise<MemorySearchResult[]>;

  /** 按会话列出记忆 */
  abstract listBySession(sessionId: string, limit?: number, offset?: number): Promise<MemoryEntry[]>;

  /** 删除会话的所有记忆 */
  abstract deleteBySession(sessionId: string): Promise<number>;

  /** 获取统计 */
  abstract getStats(): Promise<MemoryHostStats>;

  /** 清理过期记忆 */
  abstract cleanup(options?: { maxAgeMs?: number; maxEntries?: number; strategy?: 'lru' | 'fifo' | 'importance'}): Promise<{ removed: number; freedBytes: number }>;

  /** 销毁 */
  abstract dispose(): Promise<void>;

  /** 是否就绪 */
  abstract isReady(): boolean;
}

/** 记忆主机工厂 */
export type MemoryHostFactory = (options?: Record<string, unknown>) => BaseMemoryHost;

/** 记忆主机注册信息 */
export interface MemoryHostRegistration {
  id: string;
  factory: MemoryHostFactory;
  config: MemoryHostConfig;
  isDefault?: boolean;
  priority?: number;
}

/** 记忆主机状态 */
export type MemoryHostStatus = 'uninitialized' | 'initializing' | 'ready' | 'failed';

/**
 * 记忆主机注册中心
 *
 * 管理多个记忆主机实现，支持默认主机切换和 fallback
 */
export class MemoryHostRegistry {
  private hosts: Map<string, MemoryHostRegistration> = new Map();
  private defaultHostId: string | null = null;
  private activeInstances: Map<string, BaseMemoryHost> = new Map();
  private initPromises: Map<string, Promise<void>> = new Map();
  private searchCount: number = 0;
  private totalSearchTimeMs: number = 0;

  /**
   * 注册记忆主机
   */
  register(
    id: string,
    factory: MemoryHostFactory,
    config: MemoryHostConfig,
    options: { isDefault?: boolean; priority?: number } = {},
  ): void {
    if (this.hosts.has(id)) {
      logger.warn(`[MemoryHostRegistry] Host ${id} already registered, overriding`);
    }

    this.hosts.set(id, {
      id,
      factory,
      config,
      isDefault: options.isDefault,
      priority: options.priority ?? 0,
    });

    if (options.isDefault || !this.defaultHostId) {
      this.defaultHostId = id;
    }

    logger.info(
      `[MemoryHostRegistry] Registered memory host: ${id} (${config.displayName})`,
    );
  }

  /**
   * 注销记忆主机
   */
  unregister(id: string): boolean {
    const instance = this.activeInstances.get(id);
    if (instance) {
      instance.dispose().catch(err => {
        logger.error(`[MemoryHostRegistry] Dispose host ${id} failed:`, err);
      });
      this.activeInstances.delete(id);
    }

    const existed = this.hosts.delete(id);
    if (existed && this.defaultHostId === id) {
      const remaining = Array.from(this.hosts.values())
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      this.defaultHostId = remaining[0]?.id ?? null;
    }

    return existed;
  }

  /**
   * 检查主机是否存在
   */
  has(id: string): boolean {
    return this.hosts.has(id);
  }

  /**
   * 获取主机配置
   */
  getConfig(id: string): MemoryHostConfig | null {
    return this.hosts.get(id)?.config ?? null;
  }

  /**
   * 获取默认主机 ID
   */
  getDefaultHostId(): string | null {
    return this.defaultHostId;
  }

  /**
   * 设置默认主机
   */
  setDefaultHost(id: string): boolean {
    if (!this.hosts.has(id)) {
      return false;
    }
    this.defaultHostId = id;
    logger.info(`[MemoryHostRegistry] Default memory host set to: ${id}`);
    return true;
  }

  /**
   * 获取主机实例（懒加载）
   */
  async getHost(id?: string): Promise<BaseMemoryHost> {
    const hostId = id ?? this.defaultHostId;

    if (!hostId) {
      throw new Error('No memory host registered');
    }

    const registration = this.hosts.get(hostId);
    if (!registration) {
      throw new Error(`Memory host not found: ${hostId}`);
    }

    // 检查已有实例
    let instance = this.activeInstances.get(hostId);
    if (instance && instance.isReady()) {
      return instance;
    }

    // 检查初始化中
    let initPromise = this.initPromises.get(hostId);
    if (initPromise) {
      await initPromise;
      instance = this.activeInstances.get(hostId);
      if (instance) return instance;
    }

    // 创建新实例
    instance = registration.factory();
    this.activeInstances.set(hostId, instance);

    initPromise = instance.init().catch(err => {
      logger.error(`[MemoryHostRegistry] Failed to init host ${hostId}:`, err);
      this.activeInstances.delete(hostId);
      this.initPromises.delete(hostId);
      throw err;
    });

    this.initPromises.set(hostId, initPromise);
    await initPromise;
    this.initPromises.delete(hostId);

    return instance;
  }

  /**
   * 获取所有已注册主机
   */
  listHosts(): MemoryHostConfig[] {
    return Array.from(this.hosts.values()).map(r => r.config);
  }

  /**
   * 便捷搜索方法（使用默认主机）
   */
  async search(query: string, options?: Partial<MemorySearchOptions>): Promise<MemorySearchResult[]> {
    const host = await this.getHost();
    const start = Date.now();
    const results = await host.search(query, options);
    this.searchCount++;
    this.totalSearchTimeMs += Date.now() - start;
    return results;
  }

  /**
   * 获取聚合统计
   */
  async getAggregateStats(): Promise<MemoryHostStats & { hostCount: number; activeHosts: number }> {
    let totalEntries = 0;
    let totalBytes = 0;
    let sessionCount = 0;

    for (const [_id, instance] of this.activeInstances) {
      if (instance.isReady()) {
        try {
          const stats = await instance.getStats();
          totalEntries += stats.totalEntries;
          totalBytes += stats.totalBytes;
          sessionCount += stats.sessionCount;
        } catch {
          // 忽略单个主机的错误
        }
      }
    }

    return {
      totalEntries,
      totalBytes,
      sessionCount,
      totalSearches: this.searchCount,
      cacheHits: 0,
      cacheMisses: 0,
      avgSearchTimeMs: this.searchCount > 0 ? this.totalSearchTimeMs / this.searchCount : 0,
      hostCount: this.hosts.size,
      activeHosts: this.activeInstances.size,
    };
  }

  /**
   * 清理所有主机
   */
  async disposeAll(): Promise<void> {
    for (const [id, instance] of this.activeInstances) {
      try {
        await instance.dispose();
      } catch (err) {
        logger.error(`[MemoryHostRegistry] Dispose ${id} failed:`, err);
      }
    }
    this.activeInstances.clear();
    this.initPromises.clear();
  }
}

/** 全局注册中心实例 */
let globalRegistry: MemoryHostRegistry | null = null;

/**
 * 获取全局记忆主机注册中心
 */
export function getGlobalMemoryHostRegistry(): MemoryHostRegistry {
  if (!globalRegistry) {
    globalRegistry = new MemoryHostRegistry();
  }
  return globalRegistry;
}

/**
 * 设置全局记忆主机注册中心
 */
export function setGlobalMemoryHostRegistry(registry: MemoryHostRegistry): void {
  globalRegistry = registry;
}
