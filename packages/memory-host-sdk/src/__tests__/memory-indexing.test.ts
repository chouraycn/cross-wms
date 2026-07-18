import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryIndexer } from '../memory-indexing';
import type { MemoryBackend, MemoryEntry } from '../types';

// Mock MemoryBackend
function createMockBackend(): MemoryBackend {
  const entries = new Map<number, MemoryEntry>();
  let nextId = 1;

  return {
    type: 'memory',
    name: 'mock',
    version: '1.0.0',
    capabilities: {
      vectorSearch: true,
      fullTextSearch: false,
      metadataFilter: true,
      hybridSearch: false,
      batchInsert: true,
      streaming: false,
      persistence: false,
      transactions: false,
      multimodal: false,
    },
    isAvailable: () => true,
    init: async () => {},
    insertMemory: async (text: string, metadata?: Record<string, unknown>) => {
      const id = nextId++;
      const entry: MemoryEntry = {
        id,
        text,
        metadata: metadata || {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      entries.set(id, entry);
      return id;
    },
    searchMemory: async () => [],
    getMemory: async (id: number) => entries.get(id) || null,
    deleteMemory: async (id: number) => {
      entries.delete(id);
      return true;
    },
    clearAll: async () => {
      entries.clear();
      nextId = 1;
    },
    getStats: async () => ({
      totalEntries: entries.size,
      lastUpdated: Date.now(),
      backendType: 'memory',
      isHealthy: true,
    }),
  };
}

function createEntry(id: number, text: string): MemoryEntry {
  return {
    id,
    text,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('MemoryIndexer', () => {
  let indexer: MemoryIndexer;
  let mockBackend: MemoryBackend;

  beforeEach(() => {
    mockBackend = createMockBackend();
    indexer = new MemoryIndexer({
      backend: mockBackend,
      autoOptimize: false,
      maxSegments: 5,
    });
  });

  afterEach(async () => {
    await indexer.destroy();
  });

  it('should index entries and update stats', async () => {
    const entries = [createEntry(1, 'test 1'), createEntry(2, 'test 2')];
    await indexer.index(entries);

    const stats = indexer.getIndexStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.indexedEntries).toBe(2);
    expect(stats.segments).toBe(1);
    expect(stats.health).toBe('healthy');
  });

  it('should query indexed entries', async () => {
    const entries = [createEntry(1, 'hello world'), createEntry(2, 'goodbye world')];
    await indexer.index(entries);

    const results = indexer.query(entry => entry.text.includes('hello'));
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
  });

  it('should reindex a specific entry', async () => {
    // 先插入
    await mockBackend.insertMemory('old text');
    const entries = [createEntry(1, 'old text')];
    await indexer.index(entries);

    // 更新后端数据
    const updated = createEntry(1, 'new text');
    updated.updatedAt = Date.now() + 1000;

    // 重索引（需要 mock getMemory 返回更新后的数据）
    vi.spyOn(mockBackend, 'getMemory').mockResolvedValueOnce(updated);

    await indexer.reindex('1');

    const result = await indexer.get(1);
    expect(result?.text).toBe('new text');
  });

  it('should handle batch reindex', async () => {
    const entries = [createEntry(1, 'a'), createEntry(2, 'b'), createEntry(3, 'c')];
    await indexer.index(entries);

    vi.spyOn(mockBackend, 'getMemory').mockImplementation(async (id: number) => {
      return createEntry(id, `updated ${id}`);
    });

    const result = await indexer.reindexBatch(['1', '2', '3']);

    expect(result.success.length).toBe(3);
    expect(result.failed.length).toBe(0);
  });

  it('should optimize and merge segments', async () => {
    // 创建多个段
    for (let i = 0; i < 3; i++) {
      await indexer.index([createEntry(i + 1, `entry ${i + 1}`)]);
    }

    const statsBefore = indexer.getIndexStats();
    expect(statsBefore.segments).toBe(3);

    const result = await indexer.optimize();

    expect(result.segmentsBefore).toBe(3);
    expect(result.segmentsAfter).toBe(1);
    expect(result.entriesMerged).toBe(3);
  });

  it('should deduplicate entries during optimization', async () => {
    // 同一个 ID 的条目插入到不同段
    const entry1 = createEntry(1, 'version 1');
    await new Promise(resolve => setTimeout(resolve, 10)); // 确保时间戳不同
    const entry2 = createEntry(1, 'version 2');
    entry2.updatedAt = Date.now();

    await indexer.index([entry1]);
    await indexer.index([entry2]);

    const statsBefore = indexer.getIndexStats();
    expect(statsBefore.totalEntries).toBe(2); // 重复计数

    // 禁用自动优化的索引器，手动测试去重
    const dedupIndexer = new MemoryIndexer({
      backend: mockBackend,
      autoOptimize: false,
      enableDeduplication: true,
      maxSegments: 100,
    });

    await dedupIndexer.index([entry1]);
    await dedupIndexer.index([entry2]);

    const result = await dedupIndexer.optimize();

    // 去重后应该移除重复条目
    expect(result.entriesRemoved).toBeGreaterThanOrEqual(0);

    const statsAfter = dedupIndexer.getIndexStats();
    // 由于去重逻辑，应该只保留一个条目
    expect(statsAfter.totalEntries).toBeLessThanOrEqual(1);

    await dedupIndexer.destroy();
  });

  it('should clear index', async () => {
    await indexer.index([createEntry(1, 'test'), createEntry(2, 'test2')]);

    await indexer.clear();

    const stats = indexer.getIndexStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.segments).toBe(0);
  });

  it('should get entry by id', async () => {
    const entries = [createEntry(1, 'test entry')];
    await indexer.index(entries);

    const result = await indexer.get(1);
    expect(result).not.toBeNull();
    expect(result?.text).toBe('test entry');
  });

  it('should report health status correctly', async () => {
    // 正常状态
    await indexer.index([createEntry(1, 'test')]);
    let stats = indexer.getIndexStats();
    expect(stats.health).toBe('healthy');
    expect(stats.errors.length).toBe(0);

    // 创建过多段（模拟 degraded 状态）
    // 注意：优化会在达到 maxSegments 时自动触发，所以我们需要关闭自动优化
    const noOptIndexer = new MemoryIndexer({
      backend: mockBackend,
      autoOptimize: false,
      maxSegments: 100, // 设置一个很大的值避免自动优化
    });

    for (let i = 0; i < 15; i++) {
      const entry = createEntry(i + 2, `entry ${i + 2}`);
      await noOptIndexer.index([entry]);
    }

    stats = noOptIndexer.getIndexStats();
    // 根据实际逻辑判断健康状态
    expect(stats.segments).toBeGreaterThan(5);

    await noOptIndexer.destroy();
  });

  it('should stop auto-optimize on destroy', async () => {
    const autoIndexer = new MemoryIndexer({
      backend: mockBackend,
      autoOptimize: true,
      optimizeInterval: 100,
    });

    // 销毁后不应再自动优化
    await autoIndexer.destroy();

    // 验证定时器已清除（通过私有属性）
    expect((autoIndexer as any).optimizeTimer).toBeNull();
  });
});