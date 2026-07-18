import EventEmitter from 'eventemitter3';
import type { MemoryEntry, MemoryQuery } from './types';

/**
 * MemoryCore 事件
 */
export interface MemoryCoreEvents {
  entry_stored: [entry: MemoryEntry];
  entry_retrieved: [entries: MemoryEntry[]];
  entry_forgotten: [entryId: string];
  memory_compacted: [removedCount: number];
}

/**
 * MemoryCore 配置
 */
export interface MemoryCoreConfig {
  maxEntries?: number;
  maxAgeMs?: number;
  enableEmbeddings?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<MemoryCoreConfig> = {
  maxEntries: 10000,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 天
  enableEmbeddings: false,
};

/**
 * MemoryCore 类
 *
 * 核心内存存储引擎，提供存储、检索、删除和压缩功能。
 * 支持基于时间、重要性和向量相似度的内存管理。
 */
export class MemoryCore extends EventEmitter<MemoryCoreEvents> {
  private entries: Map<string, MemoryEntry> = new Map();
  private config: Required<MemoryCoreConfig>;
  private idCounter = 0;

  constructor(config?: MemoryCoreConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 存储内存条目
   * @param entry 内存条目（不含 id 和时间戳）
   * @returns 生成的条目 ID
   */
  async store(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const id = `mem-${++this.idCounter}`;
    const now = Date.now();

    const fullEntry: MemoryEntry = {
      id,
      createdAt: now,
      updatedAt: now,
      ...entry,
    };

    // 检查是否需要压缩
    if (this.entries.size >= this.config.maxEntries) {
      await this.compact();
    }

    this.entries.set(id, fullEntry);
    this.emit('entry_stored', fullEntry);

    return id;
  }

  /**
   * 检索内存条目
   * @param query 查询条件
   * @returns 匹配的内存条目数组
   */
  async retrieve(query: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values());

    // 按类型过滤
    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }

    // 按 ID 过滤
    if (query.ids && query.ids.length > 0) {
      results = results.filter((e) => query.ids!.includes(e.id));
    }

    // 按最小重要性过滤
    if (query.minImportance !== undefined) {
      results = results.filter(
        (e) => e.importance !== undefined && e.importance >= query.minImportance!,
      );
    }

    // 按时间范围过滤
    if (query.timeRange) {
      if (query.timeRange.from) {
        results = results.filter((e) => e.createdAt >= query.timeRange!.from!);
      }
      if (query.timeRange.to) {
        results = results.filter((e) => e.createdAt <= query.timeRange!.to!);
      }
    }

    // 按元数据过滤
    if (query.metadata) {
      results = results.filter((e) => {
        if (!e.metadata) return false;
        return Object.entries(query.metadata!).every(
          ([key, value]) => e.metadata![key] === value,
        );
      });
    }

    // 排序（按创建时间降序）
    results.sort((a, b) => b.createdAt - a.createdAt);

    // 应用分页
    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    this.emit('entry_retrieved', results);

    return results;
  }

  /**
   * 删除内存条目
   * @param entryId 条目 ID
   */
  async forget(entryId: string): Promise<void> {
    const existed = this.entries.delete(entryId);
    if (existed) {
      this.emit('entry_forgotten', entryId);
    }
  }

  /**
   * 压缩内存（清理过期和低重要性条目）
   */
  async compact(): Promise<void> {
    const now = Date.now();
    const maxAge = this.config.maxAgeMs;
    let removedCount = 0;

    // 删除过期条目
    const toRemove: string[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt < now) {
        toRemove.push(id);
      } else if (now - entry.createdAt > maxAge) {
        // 根据重要性决定是否删除
        if (entry.importance === undefined || entry.importance < 0.5) {
          toRemove.push(id);
        }
      }
    }

    // 如果仍然超过限制，按重要性删除
    if (this.entries.size - toRemove.length > this.config.maxEntries) {
      const remaining = Array.from(this.entries.entries())
        .filter(([id]) => !toRemove.includes(id))
        .sort((a, b) => (a[1].importance ?? 0) - (b[1].importance ?? 0));

      const excess = remaining.length - this.config.maxEntries;
      for (let i = 0; i < excess; i++) {
        toRemove.push(remaining[i][0]);
      }
    }

    // 执行删除
    for (const id of toRemove) {
      this.entries.delete(id);
      removedCount++;
    }

    if (removedCount > 0) {
      this.emit('memory_compacted', removedCount);
    }
  }

  /**
   * 获取条目数量
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * 获取单个条目
   */
  get(entryId: string): MemoryEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * 清空所有条目
   */
  clear(): void {
    this.entries.clear();
    this.idCounter = 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEntries: number;
    byType: Record<string, number>;
    avgImportance: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const entries = Array.from(this.entries.values());
    const byType: Record<string, number> = {};
    let totalImportance = 0;
    let importanceCount = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entry of entries) {
      // 按类型统计
      const type = entry.type ?? 'custom';
      byType[type] = (byType[type] ?? 0) + 1;

      // 统计重要性
      if (entry.importance !== undefined) {
        totalImportance += entry.importance;
        importanceCount++;
      }

      // 时间范围
      if (oldestEntry === null || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (newestEntry === null || entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }

    return {
      totalEntries: entries.length,
      byType,
      avgImportance: importanceCount > 0 ? totalImportance / importanceCount : 0,
      oldestEntry,
      newestEntry,
    };
  }
}

/**
 * 默认 MemoryCore 实例
 */
export const memoryCore = new MemoryCore();