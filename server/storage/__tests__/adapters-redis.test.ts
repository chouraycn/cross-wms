import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisAdapter, _resetRedisDriverCache } from '../adapters/RedisAdapter.js';

// ---------------------------------------------------------------------------
// Mock node:module 的 createRequire，用于注入 mock 的 ioredis 驱动
// ---------------------------------------------------------------------------

interface MockRedisClient {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  srem: ReturnType<typeof vi.fn>;
  smembers: ReturnType<typeof vi.fn>;
  scard: ReturnType<typeof vi.fn>;
  hset: ReturnType<typeof vi.fn>;
  hget: ReturnType<typeof vi.fn>;
  hgetall: ReturnType<typeof vi.fn>;
  hdel: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  multi: ReturnType<typeof vi.fn>;
  status: string;
}

let mockClient: MockRedisClient;
let mockMulti: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  srem: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

const { mockRequire, mockRedisCtor } = vi.hoisted(() => {
  let currentClient: unknown = null;
  const ctor = vi.fn().mockImplementation(() => currentClient);
  const mockReq = vi.fn((id: string) => {
    if (id === 'ioredis') {
      return { default: ctor, Redis: ctor };
    }
    throw new Error(`Module not found: ${id}`);
  });
  return {
    mockRequire: mockReq,
    mockRedisCtor: Object.assign(ctor, {
      _setClient: (c: unknown) => { currentClient = c; },
    }),
  };
});

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => mockRequire),
}));

function createMockClient(): MockRedisClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    exists: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([]),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(0),
    smembers: vi.fn().mockResolvedValue([]),
    scard: vi.fn().mockResolvedValue(0),
    hset: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockResolvedValue(null),
    hgetall: vi.fn().mockResolvedValue({}),
    hdel: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    multi: vi.fn().mockImplementation(() => mockMulti),
    status: 'ready',
  };
}

function createMockMulti(): typeof mockMulti {
  return {
    get: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('RedisAdapter', () => {
  let adapter: RedisAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRedisDriverCache();
    mockClient = createMockClient();
    mockMulti = createMockMulti();
    (mockRedisCtor as unknown as { _setClient: (c: unknown) => void })._setClient(mockClient);
    adapter = new RedisAdapter({ url: 'redis://localhost:6379' });
  });

  describe('构造函数', () => {
    it('应该正确创建实例', () => {
      expect(adapter).toBeInstanceOf(RedisAdapter);
    });

    it('初始状态未连接', () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('应该建立连接', async () => {
      await adapter.connect();
      expect(mockClient.connect).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(true);
    });

    it('重复调用 connect 应该幂等', async () => {
      await adapter.connect();
      await adapter.connect();
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('应该断开连接', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(false);
    });

    it('未连接时 disconnect 不报错', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('isConnected 状态依赖 status', () => {
    it('status 不是 ready 时返回 false', async () => {
      await adapter.connect();
      mockClient.status = 'connecting';
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('getAsync / runAsync / deleteAsync', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('getAsync 应返回解析后的 JSON', async () => {
      mockClient.get.mockResolvedValueOnce(JSON.stringify({ id: '1', name: 'test' }));
      const result = await adapter.getAsync('users', '1');
      expect(result).toEqual({ id: '1', name: 'test' });
      expect(mockClient.get).toHaveBeenCalledWith('storage:users:1');
    });

    it('getAsync 不存在时返回 undefined', async () => {
      mockClient.get.mockResolvedValueOnce(null);
      const result = await adapter.getAsync('users', '999');
      expect(result).toBeUndefined();
    });

    it('runAsync 应写入 JSON 并更新索引', async () => {
      const data = { id: '1', name: 'alice', age: 30 };
      const result = await adapter.runAsync('users', '1', data);
      expect(mockClient.set).toHaveBeenCalledWith(
        'storage:users:1',
        JSON.stringify(data),
      );
      expect(mockClient.sadd).toHaveBeenCalledWith('storage:users:__index__', '1');
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it('runAsync 带 TTL 应设置过期时间', async () => {
      const data = { id: '2', name: 'bob' };
      await adapter.runAsync('users', '2', data, 3600);
      expect(mockClient.set).toHaveBeenCalledWith(
        'storage:users:2',
        JSON.stringify(data),
        'EX',
        3600,
      );
    });

    it('deleteAsync 应删除 key 并移除索引', async () => {
      mockClient.del.mockResolvedValueOnce(1);
      const deleted = await adapter.deleteAsync('users', '1');
      expect(mockClient.del).toHaveBeenCalledWith('storage:users:1');
      expect(mockClient.srem).toHaveBeenCalledWith('storage:users:__index__', '1');
      expect(deleted).toBe(1);
    });
  });

  describe('allAsync', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('应返回所有行', async () => {
      mockClient.smembers.mockResolvedValueOnce(['1', '2', '__init__']);
      mockMulti.exec.mockResolvedValueOnce([
        JSON.stringify({ id: '1', name: 'a' }),
        JSON.stringify({ id: '2', name: 'b' }),
        'OK',
      ]);
      const rows = await adapter.allAsync('users');
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('1');
    });

    it('空集合应返回空数组', async () => {
      mockClient.smembers.mockResolvedValueOnce(['__init__']);
      const rows = await adapter.allAsync('users');
      expect(rows).toEqual([]);
    });
  });

  describe('nextIdAsync', () => {
    it('应返回自增 ID', async () => {
      await adapter.connect();
      mockClient.incr.mockResolvedValueOnce(42);
      const id = await adapter.nextIdAsync('users');
      expect(id).toBe(42);
      expect(mockClient.incr).toHaveBeenCalledWith('storage:users:__auto_increment__');
    });
  });

  describe('exec - CREATE TABLE', () => {
    it('应创建表索引集合', async () => {
      await adapter.connect();
      adapter.exec('CREATE TABLE IF NOT EXISTS test_table');
      expect(mockClient.sadd).toHaveBeenCalledWith(
        'storage:test_table:__index__',
        '__init__',
      );
    });

    it('不支持的 SQL 应抛出', async () => {
      await adapter.connect();
      expect(() => adapter.exec('DROP TABLE users')).toThrow('不支持的 SQL');
    });
  });

  describe('同步方法应抛出明确错误', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('get() 同步应抛出', () => {
      expect(() => adapter.get('SELECT 1')).toThrow('异步操作');
    });

    it('all() 同步应抛出', () => {
      expect(() => adapter.all('SELECT 1')).toThrow('异步操作');
    });

    it('run() 同步应抛出', () => {
      expect(() => adapter.run('SELECT 1')).toThrow('异步操作');
    });

    it('transaction() 同步应抛出', () => {
      expect(() => adapter.transaction(() => 0)).toThrow('异步操作');
    });

    it('migrate() 同步应抛出', () => {
      expect(() => adapter.migrate('1.0', '')).toThrow('异步操作');
    });

    it('getVersion() 同步应抛出', () => {
      expect(() => adapter.getVersion()).toThrow('异步操作');
    });
  });

  describe('migrateAsync / getVersionAsync', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('migrateAsync 应写入版本', async () => {
      await adapter.migrateAsync('1.2.3', '');
      expect(mockClient.set).toHaveBeenCalledWith(
        'storage:__schema_version__',
        '1.2.3',
      );
    });

    it('getVersionAsync 应返回版本', async () => {
      mockClient.get.mockResolvedValueOnce('2.0.0');
      const ver = await adapter.getVersionAsync();
      expect(ver).toBe('2.0.0');
    });

    it('getVersionAsync 无版本时返回 0.0.0', async () => {
      mockClient.get.mockResolvedValueOnce(null);
      const ver = await adapter.getVersionAsync();
      expect(ver).toBe('0.0.0');
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
