import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgresAdapter, _resetPgDriverCache } from '../adapters/PostgresAdapter.js';

// ---------------------------------------------------------------------------
// Mock node:module 的 createRequire，用于注入 mock 的 pg 驱动
// ---------------------------------------------------------------------------

interface MockQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

let mockPool: {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

let mockClient: {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

const { mockRequire, mockPgPool } = vi.hoisted(() => {
  let currentPool: unknown = null;
  const ctor = vi.fn().mockImplementation(() => currentPool);
  const mockReq = vi.fn((id: string) => {
    if (id === 'pg') {
      return { Pool: ctor };
    }
    throw new Error(`Module not found: ${id}`);
  });
  return {
    mockRequire: mockReq,
    mockPgPool: Object.assign(ctor, {
      _setPool: (p: unknown) => { currentPool = p; },
    }),
  };
});

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => mockRequire),
}));

function createMockClient(): typeof mockClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
}

function createMockPool(): typeof mockPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockImplementation(async () => {
      mockClient = createMockClient();
      return mockClient;
    }),
    end: vi.fn().mockResolvedValue(undefined),
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('PostgresAdapter', () => {
  let adapter: PostgresAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetPgDriverCache();
    mockPool = createMockPool();
    (mockPgPool as unknown as { _setPool: (p: unknown) => void })._setPool(mockPool);
    adapter = new PostgresAdapter({
      connectionString: 'postgresql://user:pass@localhost:5432/testdb',
    });
  });

  describe('构造函数', () => {
    it('应该正确存储连接字符串', () => {
      const a = new PostgresAdapter({
        connectionString: 'postgresql://localhost/db',
      });
      expect(a).toBeInstanceOf(PostgresAdapter);
    });

    it('初始状态未连接', () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('应该建立连接并验证', async () => {
      await adapter.connect();
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockClient.release).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(true);
    });

    it('重复调用 connect 应该幂等', async () => {
      await adapter.connect();
      await adapter.connect();
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('应该关闭连接池', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(mockPool.end).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(false);
    });

    it('未连接时 disconnect 不报错', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('SQL 占位符转换 (normalizeSql)', () => {
    it('应该将 ? 转换为 $1, $2, ...', async () => {
      await adapter.connect();
      const stmt = adapter.prepare('SELECT * FROM users WHERE id = ? AND name = ?');
      await stmt.get(1, 'alice');
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND name = $2',
        [1, 'alice'],
      );
    });
  });

  describe('prepare + 异步查询', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('prepare().get() 应返回单行', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'alice' }],
        rowCount: 1,
      });
      const stmt = adapter.prepare('SELECT * FROM users WHERE id = ?');
      const result = await stmt.get(1);
      expect(result).toEqual({ id: 1, name: 'alice' });
    });

    it('prepare().all() 应返回多行', async () => {
      const expected = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: expected, rowCount: 2 });
      const stmt = adapter.prepare('SELECT * FROM users');
      const result = await stmt.all();
      expect(result).toEqual(expected);
    });

    it('prepare().run() 应返回 changes 和 lastInsertRowid', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 42 }],
        rowCount: 1,
      });
      const stmt = adapter.prepare('INSERT INTO users (name) VALUES (?) RETURNING id');
      const result = await stmt.run('bob');
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(42);
    });
  });

  describe('同步方法应抛出明确错误', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('get() 同步调用应抛出', () => {
      expect(() => adapter.get('SELECT 1')).toThrow('不支持同步调用');
    });

    it('all() 同步调用应抛出', () => {
      expect(() => adapter.all('SELECT 1')).toThrow('不支持同步调用');
    });

    it('run() 同步调用应抛出', () => {
      expect(() => adapter.run('SELECT 1')).toThrow('不支持同步调用');
    });

    it('transaction() 同步调用应抛出', () => {
      expect(() => adapter.transaction(() => 0)).toThrow('异步操作');
    });

    it('migrate() 同步调用应抛出', () => {
      expect(() => adapter.migrate('1.0', '')).toThrow('异步操作');
    });

    it('getVersion() 同步调用应抛出', () => {
      expect(() => adapter.getVersion()).toThrow('异步操作');
    });
  });

  describe('transactionAsync', () => {
    it('应正确 BEGIN/COMMIT', async () => {
      await adapter.connect();

      const txClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      };

      mockPool.connect = vi.fn().mockResolvedValue(txClient);

      await adapter.transactionAsync(async (client) => {
        await client.query('INSERT INTO t VALUES (1)');
        return 'ok';
      });

      const calls = txClient.query.mock.calls;
      expect(calls[0][0]).toBe('BEGIN');
      expect(calls[1][0]).toBe('INSERT INTO t VALUES (1)');
      expect(calls[2][0]).toBe('COMMIT');
      expect(txClient.release).toHaveBeenCalled();
    });

    it('出错时应 ROLLBACK', async () => {
      await adapter.connect();

      const txClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockRejectedValueOnce(new Error('sql error')) // fn 中的查询
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // ROLLBACK
        release: vi.fn(),
      };

      mockPool.connect = vi.fn().mockResolvedValue(txClient);

      await expect(
        adapter.transactionAsync(async (client) => {
          await client.query('BAD SQL');
          return 'ok';
        }),
      ).rejects.toThrow('sql error');

      const calls = txClient.query.mock.calls;
      expect(calls[0][0]).toBe('BEGIN');
      expect(calls[1][0]).toBe('BAD SQL');
      expect(calls[2][0]).toBe('ROLLBACK');
      expect(txClient.release).toHaveBeenCalled();
    });
  });

  describe('未连接时操作应报错', () => {
    it('prepare 应抛出未连接错误', () => {
      expect(() => adapter.prepare('SELECT 1')).toThrow('未连接');
    });

    it('exec 应抛出未连接错误', () => {
      expect(() => adapter.exec('SELECT 1')).toThrow('未连接');
    });
  });
});
