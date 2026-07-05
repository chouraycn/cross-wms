/**
 * VecMemoryHost - 向量记忆主机适配器
 *
 * 将现有的 vecMemoryStore 包装为 BaseMemoryHost 接口
 */

import { logger } from '../../logger.js';
import {
  BaseMemoryHost,
  MemoryHostConfig,
  MemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  MemoryHostStats,
} from './types.js';

import {
  insertMemoryWithChunks,
  hybridSearchMemory,
  getMemory,
  deleteMemory,
  getRecentMemories,
  getMemoryStats,
} from '../vecMemoryStore.js';

/**
 * VecMemoryHost 配置
 */
export interface VecMemoryHostOptions {
  defaultTopK?: number;
}

/**
 * 向量记忆主机实现
 */
export class VecMemoryHost extends BaseMemoryHost {
  readonly config: MemoryHostConfig;
  private ready = false;
  private searchCount = 0;
  private totalSearchTimeMs = 0;

  constructor(options: VecMemoryHostOptions = {}) {
    super();
    this.config = {
      hostId: 'vec-memory',
      displayName: 'Vector Memory Store',
      description: '基于 sqlite-vec 的向量记忆存储，支持语义搜索',
      defaultTopK: options.defaultTopK ?? 5,
    };
  }

  async init(): Promise<void> {
    try {
      // 触发 vecMemoryStore 的初始化（通过调用一个简单操作）
      getMemoryStats();
      this.ready = true;
      logger.debug('[VecMemoryHost] Initialized successfully');
    } catch (err) {
      logger.error('[VecMemoryHost] Initialization failed:', err);
      this.ready = false;
      throw err;
    }
  }

  async add(
    entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'sizeBytes'>,
  ): Promise<MemoryEntry> {
    const now = Date.now();
    const sizeBytes = new TextEncoder().encode(entry.content).length;

    // 使用分块插入
    const insertedIds = await insertMemoryWithChunks(
      entry.content,
      {
        sessionId: entry.sessionId,
        ...(entry.metadata ?? {}),
        memoryId: entry.id,
      },
    );

    return {
      ...entry,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      sizeBytes,
      id: String(insertedIds[0] ?? entry.id),
    };
  }

  async addBatch(
    entries: Array<Omit<MemoryEntry, 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'sizeBytes'>>,
  ): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    for (const entry of entries) {
      const added = await this.add(entry);
      results.push(added);
    }
    return results;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    try {
      const numId = parseInt(id, 10);
      if (isNaN(numId)) {
        return null;
      }

      const result = getMemory(numId);
      if (!result) {
        return null;
      }

      const now = Date.now();
      return {
        id: String(result.id),
        sessionId: (result.metadata as Record<string, unknown>)?.sessionId as string ?? 'unknown',
        content: result.text,
        metadata: result.metadata as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
        accessCount: 1,
        lastAccessedAt: now,
        sizeBytes: new TextEncoder().encode(result.text).length,
      };
    } catch (err) {
      logger.warn('[VecMemoryHost] Get failed:', err);
      return null;
    }
  }

  async update(
    id: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'importanceScore'>>,
  ): Promise<MemoryEntry | null> {
    // vecMemoryStore 没有直接的 update，先获取再删除再插入
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const numId = parseInt(id, 10);
    if (!isNaN(numId)) {
      deleteMemory(numId);
    }

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
    };

    // 重新插入
    await insertMemoryWithChunks(
      updated.content,
      {
        sessionId: updated.sessionId,
        ...(updated.metadata ?? {}),
      },
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    try {
      const numId = parseInt(id, 10);
      if (isNaN(numId)) {
        return false;
      }
      return deleteMemory(numId);
    } catch (err) {
      logger.warn('[VecMemoryHost] Delete failed:', err);
      return false;
    }
  }

  async search(
    query: string,
    options?: Partial<MemorySearchOptions>,
  ): Promise<MemorySearchResult[]> {
    const start = Date.now();

    try {
      const results = await hybridSearchMemory(query, {
        topK: options?.topK ?? this.config.defaultTopK,
        vectorWeight: options?.hybridWeights?.vector ?? 0.7,
        textWeight: options?.hybridWeights?.text ?? 0.3,
        useMMR: options?.mmr?.enabled ?? true,
        mmrLambda: options?.mmr?.lambda ?? 0.5,
        filters: options?.filter,
      });

      const memoryResults: MemorySearchResult[] = results.map((r, idx) => ({
        entry: {
          id: String(r.id),
          sessionId: (r.metadata as Record<string, unknown>)?.sessionId as string ?? 'unknown',
          content: r.text,
          metadata: r.metadata as Record<string, unknown>,
          createdAt: 0,
          updatedAt: 0,
          accessCount: 0,
          lastAccessedAt: 0,
          sizeBytes: new TextEncoder().encode(r.text).length,
          importanceScore: r.similarity,
        },
        score: r.similarity,
        rank: idx + 1,
      }));

      this.searchCount++;
      this.totalSearchTimeMs += Date.now() - start;

      return memoryResults;
    } catch (err) {
      logger.warn('[VecMemoryHost] Search failed:', err);
      return [];
    }
  }

  async listBySession(
    sessionId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<MemoryEntry[]> {
    try {
      const memories = getRecentMemories(limit + offset, { sessionId });
      const sliced = memories.slice(offset, offset + limit);

      return sliced.map(m => ({
        id: String(m.id),
        sessionId,
        content: m.text,
        metadata: m.metadata as Record<string, unknown>,
        createdAt: new Date(m.createdAt).getTime(),
        updatedAt: new Date(m.createdAt).getTime(),
        accessCount: 0,
        lastAccessedAt: new Date(m.createdAt).getTime(),
        sizeBytes: new TextEncoder().encode(m.text).length,
      }));
    } catch (err) {
      logger.warn('[VecMemoryHost] listBySession failed:', err);
      return [];
    }
  }

  async deleteBySession(sessionId: string): Promise<number> {
    try {
      let count = 0;
      const memories = getRecentMemories(10000, { sessionId });
      for (const m of memories) {
        if (deleteMemory(m.id)) {
          count++;
        }
      }
      logger.debug(`[VecMemoryHost] Deleted ${count} memories for session ${sessionId}`);
      return count;
    } catch (err) {
      logger.warn('[VecMemoryHost] deleteBySession failed:', err);
      return 0;
    }
  }

  async getStats(): Promise<MemoryHostStats> {
    try {
      const stats = getMemoryStats();
      return {
        totalEntries: stats.totalMemories,
        totalBytes: stats.avgTextLength * stats.totalMemories,
        sessionCount: 1,
        totalSearches: this.searchCount,
        cacheHits: 0,
        cacheMisses: 0,
        avgSearchTimeMs: this.searchCount > 0 ? this.totalSearchTimeMs / this.searchCount : 0,
      };
    } catch {
      return {
        totalEntries: 0,
        totalBytes: 0,
        sessionCount: 0,
        totalSearches: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgSearchTimeMs: 0,
      };
    }
  }

  async cleanup(options?: {
    maxAgeMs?: number;
    maxEntries?: number;
    strategy?: 'lru' | 'fifo' | 'importance';
  }): Promise<{ removed: number; freedBytes: number }> {
    try {
      const stats = await this.getStats();
      const now = Date.now();
      const maxAgeMs = options?.maxAgeMs ?? 30 * 24 * 60 * 60 * 1000; // 30 天
      let removed = 0;

      // 获取尽可能多的记忆用于清理（覆盖最旧的条目）
      // 注意：vecMemoryStore 的 getRecentMemories 返回记录只有 createdAt，
      // 没有 lastAccessedAt/updatedAt，因此使用 createdAt 作为时间依据
      const fetchLimit = Math.max(1000, stats.totalEntries);
      const recentMemories = getRecentMemories(fetchLimit);

      // 清理超过 maxAgeMs 未访问/创建的记忆
      for (const mem of recentMemories) {
        const lastAccessed = new Date(mem.createdAt).getTime() || 0;
        if (now - lastAccessed > maxAgeMs) {
          try {
            if (deleteMemory(mem.id)) {
              removed++;
            }
          } catch {
            // 忽略单个删除失败
          }
        }
      }

      // 如果指定了 maxEntries 且仍超限，按 FIFO 删除最旧的
      if (options?.maxEntries) {
        const afterAgeStats = await this.getStats();
        if (afterAgeStats.totalEntries > options.maxEntries) {
          const toRemove = afterAgeStats.totalEntries - options.maxEntries;
          // getRecentMemories 返回最新优先，反转后从最旧开始删
          const remaining = getRecentMemories(fetchLimit).reverse();
          let extraRemoved = 0;
          for (const mem of remaining) {
            if (extraRemoved >= toRemove) break;
            try {
              if (deleteMemory(mem.id)) {
                extraRemoved++;
              }
            } catch {
              // 忽略单个删除失败
            }
          }
          removed += extraRemoved;
        }
      }

      const afterStats = await this.getStats();
      const freedBytes = Math.max(0, stats.totalBytes - afterStats.totalBytes);

      logger.info(
        `[VecMemoryHost:${this.config.hostId}] 清理完成: 移除 ${removed} 条记忆, 释放 ${freedBytes} 字节`,
      );
      return { removed, freedBytes };
    } catch (err) {
      logger.error(`[VecMemoryHost:${this.config.hostId}] 清理失败`, err);
      return { removed: 0, freedBytes: 0 };
    }
  }

  async dispose(): Promise<void> {
    this.ready = false;
    logger.debug('[VecMemoryHost] Disposed');
  }

  isReady(): boolean {
    return this.ready;
  }
}

/**
 * 创建 VecMemoryHost 工厂
 */
export function createVecMemoryHost(options?: VecMemoryHostOptions): VecMemoryHost {
  return new VecMemoryHost(options);
}

/**
 * 注册 VecMemoryHost 到全局注册中心
 */
export function registerVecMemoryHost(registry: {
  register: (
    id: string,
    factory: () => BaseMemoryHost,
    config: MemoryHostConfig,
    options?: { isDefault?: boolean; priority?: number },
  ) => void;
}): void {
  registry.register(
    'vec-memory',
    () => new VecMemoryHost(),
    {
      hostId: 'vec-memory',
      displayName: 'Vector Memory Store',
      description: '基于 sqlite-vec 的向量记忆存储，支持语义搜索',
      defaultTopK: 5,
    },
    { isDefault: true, priority: 10 },
  );
}
