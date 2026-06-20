/**
 * VecMemoryStore 单元测试 — backfillEmbeddings 分批回填 (P1)
 *
 * 验证：
 * - 批量推理正确写入 vec_index 表
 * - 整批失败时降级为逐条重试
 * - 返回值（success/failed 计数）正确
 * - vecLoaded=false 时直接返回
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Hoisted Mock State =====================

const mockState = vi.hoisted(() => ({
  db: null as unknown,
  entries: [] as Array<{ id: number; content: string; userId: string; sessionId: string; category: string; keywords: string; createdAt: string }>,
  insertFailIndices: new Set<number>(),
  vecLoadShouldFail: false,
  embedBatchShouldFail: false,
  embedTextShouldFail: false,
  insertCalls: [] as Array<{ entryId: number }>,
  runCallCounter: 0,
}));

// ===================== Mock: better-sqlite3 =====================

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockState.db),
}));

// ===================== Mock: sqlite-vec =====================

vi.mock('sqlite-vec', () => ({
  load: vi.fn(() => {
    if (mockState.vecLoadShouldFail) throw new Error('sqlite-vec not available');
  }),
}));

// ===================== Mock: onnxEmbedding =====================

vi.mock('../onnxEmbedding.js', () => ({
  embedText: vi.fn(async (text: string) => {
    if (mockState.embedTextShouldFail) throw new Error('embedText failed');
    const vec = new Float32Array(384);
    for (let i = 0; i < 384; i++) vec[i] = Math.sin(text.charCodeAt(0) + i * 0.01) * 0.01;
    return vec;
  }),
  embedBatch: vi.fn(async (texts: string[]) => {
    if (mockState.embedBatchShouldFail) throw new Error('embedBatch failed');
    return texts.map(text => {
      const vec = new Float32Array(384);
      for (let i = 0; i < 384; i++) vec[i] = Math.sin(text.charCodeAt(0) + i * 0.01) * 0.01;
      return vec;
    });
  }),
  initOnnxEmbedding: vi.fn().mockResolvedValue(undefined),
  getOnnxStatus: vi.fn().mockReturnValue({ status: 'ready', error: '' }),
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

// ===================== Mock DB Factory =====================

function createMockDb() {
  mockState.insertCalls = [];
  mockState.runCallCounter = 0;

  return {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      // Query: entries without vectors
      if (sql.includes('NOT EXISTS')) {
        return {
          all: vi.fn(() => mockState.entries),
          run: vi.fn(),
          get: vi.fn(),
        };
      }
      // Insert vector into vec_index
      if (sql.includes('INSERT INTO memory_vec_index')) {
        return {
          run: vi.fn((embedding: Buffer, entryId: number) => {
            const callIndex = mockState.runCallCounter++;
            if (mockState.insertFailIndices.has(callIndex)) {
              throw new Error('Mock insert failure');
            }
            mockState.insertCalls.push({ entryId });
          }),
          all: vi.fn(() => []),
          get: vi.fn(),
        };
      }
      // Default (for COUNT queries etc.)
      return {
        all: vi.fn(() => []),
        run: vi.fn(),
        get: vi.fn(() => ({ count: 0 })),
      };
    }),
  };
}

/** Generate mock memory entries */
function makeEntries(count: number): Array<{ id: number; content: string; userId: string; sessionId: string; category: string; keywords: string; createdAt: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    content: `Memory entry ${i + 1}`,
    userId: 'default',
    sessionId: 'session-1',
    category: 'insight',
    keywords: '',
    createdAt: '2025-01-01 00:00:00',
  }));
}

// ===================== Tests =====================

describe('VecMemoryStore — backfillEmbeddings 分批回填 (P1)', () => {
  let vecMemoryStore: typeof import('../vecMemoryStore.js');

  beforeEach(async () => {
    // Reset mock state
    mockState.entries = [];
    mockState.insertFailIndices = new Set();
    mockState.vecLoadShouldFail = false;
    mockState.embedBatchShouldFail = false;
    mockState.embedTextShouldFail = false;
    mockState.insertCalls = [];
    mockState.runCallCounter = 0;

    // Create fresh mock db
    mockState.db = createMockDb();

    // Reset modules and re-import
    vi.resetModules();
    vecMemoryStore = await import('../vecMemoryStore.js');
  });

  it('批量推理正确写入 vec_index 表（20 条，2 批）', async () => {
    // Arrange: 20 entries → 2 batches (16 + 4)
    mockState.entries = makeEntries(20);

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert
    expect(result.total).toBe(20);
    expect(result.success).toBe(20);
    expect(result.failed).toBe(0);

    // All 20 vectors should have been inserted
    expect(mockState.insertCalls).toHaveLength(20);

    // Verify entry IDs are correct
    for (let i = 0; i < 20; i++) {
      expect(mockState.insertCalls[i].entryId).toBe(i + 1);
    }
  });

  it('整批失败时降级为逐条 embedText 重试', async () => {
    // Arrange: 5 entries, embedBatch throws, embedText succeeds
    mockState.entries = makeEntries(5);
    mockState.embedBatchShouldFail = true;

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert: all 5 should succeed via fallback
    expect(result.total).toBe(5);
    expect(result.success).toBe(5);
    expect(result.failed).toBe(0);

    // All 5 vectors should have been inserted (via embedText fallback)
    expect(mockState.insertCalls).toHaveLength(5);
  });

  it('整批失败且逐条重试也失败时，failed 计数正确', async () => {
    // Arrange: 3 entries, embedBatch throws, embedText also throws
    mockState.entries = makeEntries(3);
    mockState.embedBatchShouldFail = true;
    mockState.embedTextShouldFail = true;

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert: all 3 should fail
    expect(result.total).toBe(3);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(3);
    expect(mockState.insertCalls).toHaveLength(0); // No successful inserts
  });

  it('部分插入失败时，failed 计数正确', async () => {
    // Arrange: 3 entries, embedBatch succeeds, but insert for index 1 fails
    mockState.entries = makeEntries(3);
    mockState.insertFailIndices = new Set([1]); // Second insert fails

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert: 2 success, 1 failed
    expect(result.total).toBe(3);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(mockState.insertCalls).toHaveLength(2); // Only 2 successful inserts
  });

  it('vecLoaded=false 时直接返回零值', async () => {
    // Arrange: sqlite-vec load fails → vecLoaded=false
    mockState.entries = makeEntries(10);
    mockState.vecLoadShouldFail = true;

    // Need to re-import since vecLoaded is set during getDb()
    vi.resetModules();
    vecMemoryStore = await import('../vecMemoryStore.js');

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert
    expect(result.total).toBe(0);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('无待回填条目时返回零值', async () => {
    // Arrange: no entries without vectors
    mockState.entries = [];

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert
    expect(result.total).toBe(0);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('大批量回填（35 条 = 3 批：16 + 16 + 3）', async () => {
    // Arrange
    mockState.entries = makeEntries(35);

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert
    expect(result.total).toBe(35);
    expect(result.success).toBe(35);
    expect(result.failed).toBe(0);
    expect(mockState.insertCalls).toHaveLength(35);
  });

  it('第一批成功第二批失败，第二批降级为逐条重试', async () => {
    // Arrange: 20 entries (2 batches)
    // First batch (16) succeeds, second batch (4) fails, fallback succeeds
    mockState.entries = makeEntries(20);

    // Make embedBatch fail only on the second call
    const onnxEmbedding = await import('../onnxEmbedding.js');
    const embedBatchMock = onnxEmbedding.embedBatch as ReturnType<typeof vi.fn>;
    embedBatchMock.mockReset();
    embedBatchMock.mockImplementationOnce(async (texts: string[]) => {
      // First batch succeeds
      return texts.map(text => {
        const vec = new Float32Array(384);
        for (let i = 0; i < 384; i++) vec[i] = Math.sin(text.charCodeAt(0) + i * 0.01) * 0.01;
        return vec;
      });
    });
    embedBatchMock.mockImplementationOnce(async () => {
      // Second batch fails
      throw new Error('Second batch failed');
    });

    // Act
    const result = await vecMemoryStore.backfillEmbeddings();

    // Assert: first batch (16) succeeds via embedBatch, second batch (4) succeeds via embedText fallback
    expect(result.total).toBe(20);
    expect(result.success).toBe(20);
    expect(result.failed).toBe(0);
    expect(mockState.insertCalls).toHaveLength(20);
  });
});
