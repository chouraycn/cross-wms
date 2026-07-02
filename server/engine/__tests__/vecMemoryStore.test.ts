/**
 * VecMemoryStore 单元测试 — backfillEmbeddings 分批回填 (P1)
 *
 * 验证：
 * - 批量推理正确写入 vec_index 表
 * - 返回值（success/failed 计数）正确
 * - 无待回填条目时返回零值
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Hoisted Mock State =====================

const mockState = vi.hoisted(() => ({
  entries: [] as Array<{ id: number; text: string }>,
  insertFailIndices: new Set<number>(),
  embedTextShouldFail: false,
  insertCalls: [] as Array<{ entryId: number }>,
  runCallCounter: 0,
  connectError: false,
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
        if (sql.includes('DELETE FROM memory_vec_index')) {
          return { changes: 0, lastInsertRowid: 0 };
        }
        if (sql.includes('INSERT INTO memory_vec_index')) {
          const callIndex = mockState.runCallCounter++;
          if (mockState.insertFailIndices.has(callIndex)) {
            throw new Error('Mock insert failure');
          }
          const entryId = params[0] as number;
          mockState.insertCalls.push({ entryId });
          return { changes: 1, lastInsertRowid: entryId };
        }
        return { changes: 0, lastInsertRowid: 0 };
      });

      const mockAll = vi.fn(() => {
        if (sql.includes('SELECT id, text FROM memory_entries')) {
          return mockState.entries;
        }
        return [];
      });

      return {
        run: mockRun,
        get: vi.fn(() => undefined),
        all: mockAll,
      };
    }),
    all: vi.fn((sql: string) => {
      if (sql.includes('SELECT id, text FROM memory_entries')) {
        return mockState.entries;
      }
      return [];
    }),
    run: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('DELETE FROM memory_vec_index')) {
        return { changes: 0, lastInsertRowid: 0 };
      }
      if (sql.includes('INSERT INTO memory_vec_index')) {
        const callIndex = mockState.runCallCounter++;
        if (mockState.insertFailIndices.has(callIndex)) {
          throw new Error('Mock insert failure');
        }
        const entryId = params?.[0] as number;
        mockState.insertCalls.push({ entryId });
        return { changes: 1, lastInsertRowid: entryId };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }),
    get: vi.fn(() => undefined),
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
    if (mockState.embedTextShouldFail) throw new Error('embedText failed');
    const vec = new Float32Array(384);
    for (let i = 0; i < 384; i++) vec[i] = Math.sin(text.charCodeAt(0) + i * 0.01) * 0.01;
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

// ===================== Helper =====================

function makeEntries(count: number): Array<{ id: number; text: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Memory entry ${i + 1}`,
  }));
}

// ===================== Tests =====================

describe('VecMemoryStore — backfillEmbeddings', () => {
  let vecMemoryStore: typeof import('../vecMemoryStore.js');

  beforeEach(async () => {
    mockState.entries = [];
    mockState.insertFailIndices = new Set();
    mockState.embedTextShouldFail = false;
    mockState.insertCalls = [];
    mockState.runCallCounter = 0;
    mockState.connectError = false;

    vi.resetModules();
    vecMemoryStore = await import('../vecMemoryStore.js');
  });

  it('批量推理正确写入 vec_index 表（20 条）', async () => {
    mockState.entries = makeEntries(20);

    const result = await vecMemoryStore.backfillEmbeddings();

    expect(result.total).toBe(20);
    expect(result.success).toBe(20);
    expect(result.failed).toBe(0);
    expect(mockState.insertCalls).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(mockState.insertCalls[i].entryId).toBe(i + 1);
    }
  });

  it('全部失败时，failed 计数正确', async () => {
    mockState.entries = makeEntries(3);
    mockState.embedTextShouldFail = true;

    const result = await vecMemoryStore.backfillEmbeddings();

    expect(result.total).toBe(3);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(3);
    expect(mockState.insertCalls).toHaveLength(0);
  });

  it('部分插入失败时，failed 计数正确', async () => {
    mockState.entries = makeEntries(3);
    mockState.insertFailIndices = new Set([1]);

    const result = await vecMemoryStore.backfillEmbeddings();

    expect(result.total).toBe(3);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(mockState.insertCalls).toHaveLength(2);
  });

  it('无待回填条目时返回零值', async () => {
    mockState.entries = [];

    const result = await vecMemoryStore.backfillEmbeddings();

    expect(result.total).toBe(0);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('大批量回填（35 条）', async () => {
    mockState.entries = makeEntries(35);

    const result = await vecMemoryStore.backfillEmbeddings();

    expect(result.total).toBe(35);
    expect(result.success).toBe(35);
    expect(result.failed).toBe(0);
    expect(mockState.insertCalls).toHaveLength(35);
  });

  it('部分失败时，success 和 failed 计数正确', async () => {
    mockState.entries = makeEntries(20);
    mockState.insertFailIndices = new Set([5, 10, 15]);

    const result = await vecMemoryStore.backfillEmbeddings();

    expect(result.total).toBe(20);
    expect(result.success).toBe(17);
    expect(result.failed).toBe(3);
    expect(mockState.insertCalls).toHaveLength(17);
  });
});
