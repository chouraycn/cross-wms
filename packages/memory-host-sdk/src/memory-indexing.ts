import type { MemoryEntry, MemoryBackend } from './types.js';

// 索引统计信息
export interface IndexStats {
  totalEntries: number;
  indexedEntries: number;
  pendingReindex: number;
  segments: number;
  lastOptimized: number | null;
  indexSize: number;
  health: 'healthy' | 'degraded' | 'error';
  errors: string[];
}

// 索引配置
export interface IndexerConfig {
  backend: MemoryBackend;
  autoOptimize?: boolean;
  optimizeInterval?: number; // 毫秒
  maxSegments?: number;
  enableDeduplication?: boolean;
  dedupThreshold?: number;
}

// 索引段
interface IndexSegment {
  id: string;
  entries: Map<number, MemoryEntry>;
  createdAt: number;
  size: number;
}

// 重索引选项
export interface ReindexOptions {
  force?: boolean;
  batchSize?: number;
  onProgress?: (processed: number, total: number) => void;
}

// 优化结果
export interface OptimizeResult {
  segmentsBefore: number;
  segmentsAfter: number;
  entriesMerged: number;
  entriesRemoved: number;
  duration: number;
}

/**
 * Memory 索引器
 * 负责管理 memory 条目的索引、重索引和优化
 */
export class MemoryIndexer {
  private backend: MemoryBackend;
  private segments: IndexSegment[] = [];
  private autoOptimize: boolean;
  private optimizeInterval: number;
  private maxSegments: number;
  private enableDeduplication: boolean;
  private dedupThreshold: number;
  private lastOptimized: number | null = null;
  private optimizeTimer: NodeJS.Timeout | null = null;
  private pendingReindex: Set<number> = new Set();

  constructor(config: IndexerConfig) {
    this.backend = config.backend;
    this.autoOptimize = config.autoOptimize ?? false;
    this.optimizeInterval = config.optimizeInterval ?? 60000; // 默认 1 分钟
    this.maxSegments = config.maxSegments ?? 10;
    this.enableDeduplication = config.enableDeduplication ?? true;
    this.dedupThreshold = config.dedupThreshold ?? 0.95;

    if (this.autoOptimize) {
      this.startAutoOptimize();
    }
  }

  /**
   * 索引条目
   */
  async index(entries: MemoryEntry[]): Promise<void> {
    // 创建新段
    const segment: IndexSegment = {
      id: `segment-${Date.now()}`,
      entries: new Map(),
      createdAt: Date.now(),
      size: 0,
    };

    // 添加条目到段
    for (const entry of entries) {
      segment.entries.set(entry.id, entry);
      segment.size++;
    }

    this.segments.push(segment);

    // 检查是否需要优化
    if (this.segments.length >= this.maxSegments) {
      await this.optimize();
    }
  }

  /**
   * 重索引指定条目
   */
  async reindex(entryId: string, options?: ReindexOptions): Promise<void> {
    const id = parseInt(entryId, 10);
    if (isNaN(id)) {
      throw new Error(`Invalid entry ID: ${entryId}`);
    }

    // 标记为待重索引
    this.pendingReindex.add(id);

    try {
      // 从后端获取条目
      const entry = await this.backend.getMemory(id);
      if (!entry) {
        throw new Error(`Entry not found: ${entryId}`);
      }

      // 从所有段中移除旧版本
      for (const segment of this.segments) {
        if (segment.entries.has(id)) {
          segment.entries.delete(id);
          segment.size--;
        }
      }

      // 创建新段或添加到最新段
      const latestSegment = this.segments[this.segments.length - 1];
      if (latestSegment && latestSegment.size < 100) {
        latestSegment.entries.set(id, entry);
        latestSegment.size++;
      } else {
        const newSegment: IndexSegment = {
          id: `segment-${Date.now()}`,
          entries: new Map([[id, entry]]),
          createdAt: Date.now(),
          size: 1,
        };
        this.segments.push(newSegment);
      }

      // 从待重索引列表移除
      this.pendingReindex.delete(id);
    } catch (error) {
      console.error(`Reindex failed for entry ${entryId}:`, error);
      throw error;
    }
  }

  /**
   * 批量重索引
   */
  async reindexBatch(
    entryIds: string[],
    options?: ReindexOptions,
  ): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < entryIds.length; i++) {
      try {
        await this.reindex(entryIds[i], options);
        success.push(entryIds[i]);
      } catch {
        failed.push(entryIds[i]);
      }

      // 进度回调
      if (options?.onProgress) {
        options.onProgress(i + 1, entryIds.length);
      }
    }

    return { success, failed };
  }

  /**
   * 获取索引统计信息
   */
  getIndexStats(): IndexStats {
    const errors: string[] = [];
    let indexedEntries = 0;

    for (const segment of this.segments) {
      indexedEntries += segment.size;
    }

    // 检查健康状态
    let health: 'healthy' | 'degraded' | 'error' = 'healthy';

    if (this.segments.length > this.maxSegments) {
      health = 'degraded';
      errors.push(`Too many segments: ${this.segments.length} > ${this.maxSegments}`);
    }

    if (this.pendingReindex.size > 10) {
      health = 'degraded';
      errors.push(`Many pending reindex operations: ${this.pendingReindex.size}`);
    }

    return {
      totalEntries: indexedEntries,
      indexedEntries,
      pendingReindex: this.pendingReindex.size,
      segments: this.segments.length,
      lastOptimized: this.lastOptimized,
      indexSize: this.estimateIndexSize(),
      health,
      errors,
    };
  }

  /**
   * 优化索引：合并段、清理冗余
   */
  async optimize(): Promise<OptimizeResult> {
    const startTime = Date.now();
    const segmentsBefore = this.segments.length;

    // 合并所有段到一个大段
    const mergedSegment: IndexSegment = {
      id: `segment-merged-${Date.now()}`,
      entries: new Map(),
      createdAt: Date.now(),
      size: 0,
    };

    let entriesMerged = 0;
    let entriesRemoved = 0;

    // 合并条目
    for (const segment of this.segments) {
      for (const [id, entry] of segment.entries) {
        // 去重
        if (this.enableDeduplication && mergedSegment.entries.has(id)) {
          const existing = mergedSegment.entries.get(id)!;
          if (existing.updatedAt < entry.updatedAt) {
            mergedSegment.entries.set(id, entry);
          }
          entriesRemoved++;
        } else {
          mergedSegment.entries.set(id, entry);
          entriesMerged++;
        }
      }
    }

    // 更新段列表
    this.segments = [mergedSegment];

    this.lastOptimized = Date.now();

    const duration = Date.now() - startTime;

    return {
      segmentsBefore,
      segmentsAfter: 1,
      entriesMerged,
      entriesRemoved,
      duration,
    };
  }

  /**
   * 清理索引
   */
  async clear(): Promise<void> {
    this.segments = [];
    this.pendingReindex.clear();
    this.lastOptimized = null;
  }

  /**
   * 查询索引
   */
  query(filter?: (entry: MemoryEntry) => boolean): MemoryEntry[] {
    const results: MemoryEntry[] = [];

    for (const segment of this.segments) {
      for (const entry of segment.entries.values()) {
        if (!filter || filter(entry)) {
          results.push(entry);
        }
      }
    }

    return results;
  }

  /**
   * 根据ID获取条目
   */
  async get(id: number): Promise<MemoryEntry | null> {
    // 先从索引查找
    for (const segment of this.segments) {
      const entry = segment.entries.get(id);
      if (entry) {
        return entry;
      }
    }

    // 从后端查找
    return this.backend.getMemory(id);
  }

  /**
   * 启动自动优化
   */
  private startAutoOptimize(): void {
    if (this.optimizeTimer) {
      clearInterval(this.optimizeTimer);
    }

    this.optimizeTimer = setInterval(async () => {
      try {
        if (this.segments.length >= this.maxSegments / 2) {
          await this.optimize();
        }
      } catch (error) {
        console.error('Auto-optimize failed:', error);
      }
    }, this.optimizeInterval);
  }

  /**
   * 停止自动优化
   */
  stopAutoOptimize(): void {
    if (this.optimizeTimer) {
      clearInterval(this.optimizeTimer);
      this.optimizeTimer = null;
    }
  }

  /**
   * 估算索引大小
   */
  private estimateIndexSize(): number {
    let size = 0;

    for (const segment of this.segments) {
      for (const entry of segment.entries.values()) {
        // 粗略估算每个条目的大小
        size += entry.text.length * 2; // 文本
        size += (entry.embedding?.length ?? 0) * 4; // embedding
        size += 100; // 元数据和其他字段
      }
    }

    return size;
  }

  /**
   * 销毁索引器
   */
  async destroy(): Promise<void> {
    this.stopAutoOptimize();
    await this.clear();
  }
}

/**
 * 创建 Memory 索引器
 */
export function createMemoryIndexer(config: IndexerConfig): MemoryIndexer {
  return new MemoryIndexer(config);
}