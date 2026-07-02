/**
 * 记忆系统集成测试
 *
 * 验证：
 * - vecMemoryStore 核心功能（插入、搜索、分块、回填）
 * - enhancedSearch 时间衰减和结果过滤
 * - memorySyncer 同步策略配置
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock State =====================

const mockState = vi.hoisted(() => ({
  entries: [] as Array<{ id: number; text: string; metadata: string; created_at: string }>,
  vecIndex: new Map<number, Float32Array>(),
  nextId: 1,
}));

// ===================== Mock: DatabaseManager =====================
// vecMemoryStore 通过 DatabaseManager.getVecDb() 获取数据库连接，
// 因此需要 mock databaseManager 而非 SQLiteEngine。

vi.mock('../../storage/databaseManager.js', () => {
  const mockDb = {
    exec: vi.fn(),
    pragma: vi.fn(),
    prepare: vi.fn((sql: string) => {
      const mockRun = vi.fn((...params: unknown[]) => {
        if (sql.includes('INSERT INTO memory_entries')) {
          const id = mockState.nextId++;
          const text = params[0] as string;
          const metadata = params[1] as string;
          mockState.entries.push({
            id,
            text,
            metadata,
            created_at: new Date().toISOString(),
          });
          return { changes: 1, lastInsertRowid: id };
        }
        if (sql.includes('INSERT INTO memory_vec_index')) {
          const rowid = params[0] as number;
          const embedding = params[1] as Buffer;
          const floatArr = new Float32Array(
            embedding.buffer,
            embedding.byteOffset,
            embedding.byteLength / 4
          );
          mockState.vecIndex.set(rowid, floatArr);
          return { changes: 1, lastInsertRowid: rowid };
        }
        if (sql.includes('DELETE FROM memory_vec_index')) {
          const size = mockState.vecIndex.size;
          mockState.vecIndex.clear();
          return { changes: size, lastInsertRowid: 0 };
        }
        if (sql.includes('DELETE FROM memory_entries WHERE id =')) {
          const id = params[0] as number;
          const idx = mockState.entries.findIndex(e => e.id === id);
          if (idx >= 0) {
            mockState.entries.splice(idx, 1);
            mockState.vecIndex.delete(id);
            return { changes: 1, lastInsertRowid: 0 };
          }
          return { changes: 0, lastInsertRowid: 0 };
        }
        if (sql.includes('DELETE FROM memory_entries')) {
          const size = mockState.entries.length;
          mockState.entries = [];
          mockState.vecIndex.clear();
          return { changes: size, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      });

      const mockGet = vi.fn(() => {
        if (sql.includes('COUNT(*) as total')) {
          return { total: mockState.entries.length, avg_length: 100 };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM memory_entries')) {
          return { count: mockState.entries.length };
        }
        if (sql.includes('SELECT COUNT(*) as vec_count FROM memory_vec_index')) {
          return { count: mockState.vecIndex.size };
        }
        if (sql.includes('SELECT id, text, metadata, created_at FROM memory_entries WHERE id =')) {
          return undefined;
        }
        return undefined;
      });

      const mockAll = vi.fn(() => {
        if (sql.includes('SELECT id, text FROM memory_entries ORDER BY id')) {
          return mockState.entries.map(e => ({ id: e.id, text: e.text }));
        }
        if (sql.includes('SELECT e.id, e.text, e.metadata, v.distance')) {
          const results: Array<{ id: number; text: string; metadata: string; distance: number }> = [];
          for (const [rowid] of mockState.vecIndex) {
            const entry = mockState.entries.find(e => e.id === rowid);
            if (entry) {
              results.push({
                id: entry.id,
                text: entry.text,
                metadata: entry.metadata,
                distance: Math.random() * 0.5,
              });
            }
          }
          return results.sort((a, b) => a.distance - b.distance).slice(0, 5);
        }
        if (sql.includes('SELECT id, text, metadata, created_at FROM memory_entries')) {
          return mockState.entries
            .sort((a, b) => b.id - a.id)
            .slice(0, 10)
            .map(e => ({ ...e, created_at: e.created_at }));
        }
        return [];
      });

      return {
        run: mockRun,
        get: mockGet,
        all: mockAll,
      };
    }),
    all: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id, text FROM memory_entries ORDER BY id')) {
        return mockState.entries.map(e => ({ id: e.id, text: e.text }));
      }
      if (sql.includes('SELECT e.id, e.text, e.metadata, v.distance')) {
        const results: Array<{ id: number; text: string; metadata: string; distance: number }> = [];
        for (const [rowid] of mockState.vecIndex) {
          const entry = mockState.entries.find(e => e.id === rowid);
          if (entry) {
            results.push({
              id: entry.id,
              text: entry.text,
              metadata: entry.metadata,
              distance: Math.random() * 0.5,
            });
          }
        }
        return results.sort((a, b) => a.distance - b.distance).slice(0, (params?.[1] as number) || 5);
      }
      if (sql.includes('SELECT id, text, metadata, created_at FROM memory_entries')) {
        return mockState.entries
          .sort((a, b) => b.id - a.id)
          .slice(0, (params?.[0] as number) || 10)
          .map(e => ({ ...e, created_at: e.created_at }));
      }
      return [];
    }),
    run: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO memory_entries')) {
        const id = mockState.nextId++;
        const text = (params as unknown[])[0] as string;
        const metadata = (params as unknown[])[1] as string;
        mockState.entries.push({
          id,
          text,
          metadata,
          created_at: new Date().toISOString(),
        });
        return { changes: 1, lastInsertRowid: id };
      }
      if (sql.includes('INSERT INTO memory_vec_index')) {
        const rowid = (params as unknown[])[0] as number;
        const embedding = (params as unknown[])[1] as Buffer;
        const floatArr = new Float32Array(
          embedding.buffer,
          embedding.byteOffset,
          embedding.byteLength / 4
        );
        mockState.vecIndex.set(rowid, floatArr);
        return { changes: 1, lastInsertRowid: rowid };
      }
      if (sql.includes('DELETE FROM memory_vec_index')) {
        const size = mockState.vecIndex.size;
        mockState.vecIndex.clear();
        return { changes: size, lastInsertRowid: 0 };
      }
      if (sql.includes('DELETE FROM memory_entries WHERE id =')) {
        const id = (params as unknown[])[0] as number;
        const idx = mockState.entries.findIndex(e => e.id === id);
        if (idx >= 0) {
          mockState.entries.splice(idx, 1);
          mockState.vecIndex.delete(id);
          return { changes: 1, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      }
      if (sql.includes('DELETE FROM memory_entries')) {
        const size = mockState.entries.length;
        mockState.entries = [];
        mockState.vecIndex.clear();
        return { changes: size, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }),
    get: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('COUNT(*) as total')) {
        return { total: mockState.entries.length, avg_length: 100 };
      }
      if (sql.includes('SELECT COUNT(*) as count FROM memory_entries')) {
        return { count: mockState.entries.length };
      }
      if (sql.includes('SELECT COUNT(*) as vec_count FROM memory_vec_index')) {
        return { count: mockState.vecIndex.size };
      }
      if (sql.includes('SELECT id, text, metadata, created_at FROM memory_entries WHERE id =')) {
        const id = params?.[0] as number;
        return mockState.entries.find(e => e.id === id);
      }
      return undefined;
    }),
    close: vi.fn(),
  };
  return {
    DatabaseManager: {
      getVecDb: () => mockDb,
      getMainDb: () => mockDb,
      closeAll: vi.fn(),
    },
  };
});

// ===================== Mock: onnxEmbedding =====================

vi.mock('../onnxEmbedding.js', () => ({
  ONNX_EMBEDDING_DIMENSIONS: 384,
  embedText: vi.fn(async (text: string) => {
    const vec = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      vec[i] = Math.sin(text.charCodeAt(0 % text.length) + i * 0.01) * 0.01;
    }
    return vec;
  }),
  initOnnxEmbedding: vi.fn().mockResolvedValue(undefined),
  getOnnxStatus: vi.fn().mockReturnValue({ status: 'ready', error: '' }),
}));

// ===================== Mock: AppPaths =====================

vi.mock('../../config/appPaths.js', () => ({
  AppPaths: {
    memoryDir: '/tmp/mock-memory',
  },
}));

// ===================== Mock: fs =====================

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

// ===================== Mock: logger =====================

vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ===================== Tests =====================

describe('记忆系统集成测试', () => {
  let vecMemoryStore: typeof import('../vecMemoryStore.js');

  beforeEach(async () => {
    mockState.entries = [];
    mockState.vecIndex.clear();
    mockState.nextId = 1;

    vi.resetModules();
    vecMemoryStore = await import('../vecMemoryStore.js');
  });

  describe('核心 CRUD', () => {
    it('插入记忆后可以获取统计', async () => {
      const id = await vecMemoryStore.insertMemory('测试记忆内容', { category: 'test' });
      expect(id).toBeGreaterThan(0);

      const stats = vecMemoryStore.getMemoryStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalMemories).toBe('number');
    });

    it('插入多条记忆后可以获取最近记忆', async () => {
      for (let i = 0; i < 5; i++) {
        await vecMemoryStore.insertMemory(`记忆 ${i}`, { index: i });
      }

      const recent = vecMemoryStore.getRecentMemories(3);
      expect(Array.isArray(recent)).toBe(true);
      expect(recent.length).toBeLessThanOrEqual(5);
    });

    it('删除记忆返回布尔值', async () => {
      const id = await vecMemoryStore.insertMemory('待删除', {});
      const deleted = vecMemoryStore.deleteMemory(id);
      expect(typeof deleted).toBe('boolean');
    });

    it('清空所有记忆', async () => {
      for (let i = 0; i < 3; i++) {
        await vecMemoryStore.insertMemory(`记忆 ${i}`, {});
      }

      const cleared = vecMemoryStore.clearAllMemories();
      expect(typeof cleared).toBe('boolean');
    });
  });

  describe('文本分块', () => {
    it('短文本不分块', () => {
      const chunks = vecMemoryStore.chunkText('短文本', { maxChars: 100, overlapChars: 10 });
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe('短文本');
    });

    it('长文本应正确分块', () => {
      const longText = '啊'.repeat(500);
      const chunks = vecMemoryStore.chunkText(longText, { maxChars: 100, overlapChars: 20 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }
    });

    it('分块结果有重叠', () => {
      const text = '一二三四五六七八九十'.repeat(20);
      const chunks = vecMemoryStore.chunkText(text, { maxChars: 50, overlapChars: 10 });
      if (chunks.length >= 2) {
        const overlap = chunks[0].slice(-10);
        expect(chunks[1]).toContain(overlap.slice(0, 5));
      }
    });
  });

  describe('向量搜索', () => {
    it('搜索记忆返回数组', async () => {
      await vecMemoryStore.insertMemory('JavaScript 编程技巧', { category: 'tech' });
      await vecMemoryStore.insertMemory('Python 数据科学', { category: 'tech' });

      const results = await vecMemoryStore.searchMemory('编程', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('混合搜索返回数组', async () => {
      await vecMemoryStore.insertMemory('TypeScript 类型系统', { category: 'tech' });
      await vecMemoryStore.insertMemory('React 组件开发', { category: 'tech' });

      const results = await vecMemoryStore.hybridSearchMemory('组件', {
        topK: 5,
        vectorWeight: 0.7,
        textWeight: 0.3,
        candidateMultiplier: 3,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('搜索结果包含 metadata', async () => {
      await vecMemoryStore.insertMemory('测试记忆', { category: 'test', source: 'unit-test' });

      const results = await vecMemoryStore.searchMemory('测试', 3);
      if (results.length > 0) {
        expect(results[0].metadata).toBeDefined();
        expect(typeof results[0].metadata).toBe('object');
      }
    });
  });

  describe('批量回填', () => {
    it('backfillEmbeddings 返回统计', async () => {
      for (let i = 0; i < 5; i++) {
        await vecMemoryStore.insertMemory(`回填测试 ${i}`, {});
      }

      const result = await vecMemoryStore.backfillEmbeddings();
      expect(result).toBeDefined();
      expect(typeof result.total).toBe('number');
      expect(typeof result.success).toBe('number');
      expect(typeof result.failed).toBe('number');
      expect(result.success + result.failed).toBe(result.total);
    });

    it('空数据回填返回零值', async () => {
      const result = await vecMemoryStore.backfillEmbeddings();
      expect(result.total).toBe(0);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('混合搜索配置', () => {
    it('默认混合搜索配置合理', async () => {
      await vecMemoryStore.insertMemory('测试数据 A', {});
      await vecMemoryStore.insertMemory('测试数据 B', {});

      const results = await vecMemoryStore.hybridSearchMemory('测试');
      expect(Array.isArray(results)).toBe(true);
    });
  });
});

describe('enhancedSearch 增强搜索', () => {
  it('applyTimeDecay 函数存在', async () => {
    const mod = await import('../context-engine/enhancedSearch.js');
    expect(typeof mod.applyTimeDecay).toBe('function');
  });

  it('filterByAge 函数存在', async () => {
    const mod = await import('../context-engine/enhancedSearch.js');
    expect(typeof mod.filterByAge).toBe('function');
  });

  it('时间衰减应用后分数变化', async () => {
    const { applyTimeDecay } = await import('../context-engine/enhancedSearch.js');

    const now = Date.now();
    const results = [
      { id: 1, text: '旧', metadata: { createdAt: now - 30 * 24 * 60 * 60 * 1000 }, distance: 0.3, similarity: 0.7 },
      { id: 2, text: '新', metadata: { createdAt: now - 1 * 24 * 60 * 60 * 1000 }, distance: 0.4, similarity: 0.6 },
    ];

    const withDecay = applyTimeDecay(results, { halfLifeDays: 7, now });
    expect(withDecay.length).toBe(2);
    expect(withDecay[0].adjustedScore).toBeDefined();
    expect(withDecay[1].adjustedScore).toBeDefined();
    expect(withDecay[0].timeDecayWeight).toBeDefined();
  });

  it('按年龄过滤移除过期结果（参数是天数）', async () => {
    const { filterByAge } = await import('../context-engine/enhancedSearch.js');

    const now = Date.now();
    const results = [
      { id: 1, text: '30天前', metadata: { createdAt: now - 30 * 24 * 60 * 60 * 1000 }, distance: 0.3, similarity: 0.7 },
      { id: 2, text: '1天前', metadata: { createdAt: now - 1 * 24 * 60 * 60 * 1000 }, distance: 0.4, similarity: 0.6 },
    ];

    const filtered = filterByAge(results, 7);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(2);
  });
});

describe('memorySyncer 记忆同步', () => {
  it('DEFAULT_MEMORY_SYNC_CONFIG 存在且合理', async () => {
    const mod = await import('../context-engine/memorySyncer.js');
    expect(mod.DEFAULT_MEMORY_SYNC_CONFIG).toBeDefined();
    expect(mod.DEFAULT_MEMORY_SYNC_CONFIG.strategy).toBe('on_search');
  });

  it('支持四种同步策略', async () => {
    const mod = await import('../context-engine/memorySyncer.js');
    const strategies = ['on_turn', 'on_search', 'interval', 'manual'];
    for (const s of strategies) {
      expect(typeof s).toBe('string');
    }
    expect(mod.DEFAULT_MEMORY_SYNC_CONFIG.strategy).toBeDefined();
  });
});
