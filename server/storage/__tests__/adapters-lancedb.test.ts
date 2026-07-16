import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LanceDBAdapter, _resetLanceDBDriverCache } from '../adapters/LanceDBAdapter.js';

// ---------------------------------------------------------------------------
// Mock node:module 的 createRequire，用于注入 mock 的 lancedb 驱动
// ---------------------------------------------------------------------------

interface MockTable {
  name: string;
  countRows: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  vectorSearch: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockQueryBuilder {
  filter: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  toArray: ReturnType<typeof vi.fn>;
}

interface MockVectorSearch {
  limit: ReturnType<typeof vi.fn>;
  filter: ReturnType<typeof vi.fn>;
  column: ReturnType<typeof vi.fn>;
  toArray: ReturnType<typeof vi.fn>;
}

let mockClient: {
  openTable: ReturnType<typeof vi.fn>;
  createTable: ReturnType<typeof vi.fn>;
  dropTable: ReturnType<typeof vi.fn>;
  tableNames: ReturnType<typeof vi.fn>;
};

function createMockTable(name: string): MockTable {
  return {
    name,
    countRows: vi.fn().mockResolvedValue(0),
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    vectorSearch: vi.fn().mockImplementation(() => createMockVectorSearch()),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockQueryBuilder(): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    filter: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  };
  return builder;
}

function createMockVectorSearch(): MockVectorSearch {
  const search: MockVectorSearch = {
    limit: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    column: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  };
  return search;
}

const { mockRequire, mockConnect } = vi.hoisted(() => {
  let currentClient: unknown = null;
  const connectFn = vi.fn().mockImplementation(async () => currentClient);
  const mockReq = vi.fn((id: string) => {
    if (id === 'lancedb') {
      return { connect: connectFn };
    }
    throw new Error(`Module not found: ${id}`);
  });
  return {
    mockRequire: mockReq,
    mockConnect: Object.assign(connectFn, {
      _setClient: (c: unknown) => { currentClient = c; },
    }),
  };
});

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => mockRequire),
}));

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('LanceDBAdapter', () => {
  let adapter: LanceDBAdapter;
  let mockTable: MockTable;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetLanceDBDriverCache();
    mockTable = createMockTable('test');
    mockClient = {
      openTable: vi.fn().mockResolvedValue(mockTable),
      createTable: vi.fn().mockResolvedValue(mockTable),
      dropTable: vi.fn().mockResolvedValue(undefined),
      tableNames: vi.fn().mockResolvedValue(['test']),
    };
    (mockConnect as unknown as { _setClient: (c: unknown) => void })._setClient(mockClient);
    adapter = new LanceDBAdapter({ uri: '/tmp/lancedb-test' });
  });

  describe('构造函数', () => {
    it('应该正确创建实例', () => {
      expect(adapter).toBeInstanceOf(LanceDBAdapter);
    });

    it('初始状态未连接', () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('应该建立连接', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });

    it('重复调用 connect 应该幂等', async () => {
      await adapter.connect();
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('应该断开连接并清理缓存', async () => {
      await adapter.connect();
      // 先打开一个表以填充缓存
      await adapter.openTable('test');
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(mockTable.close).toHaveBeenCalled();
    });

    it('未连接时 disconnect 不报错', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('表操作', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('openTable 应打开表并缓存', async () => {
      const table = await adapter.openTable('my_table');
      expect(table).toBeDefined();
      expect(mockClient.openTable).toHaveBeenCalledWith('my_table');
      // 第二次应走缓存
      const table2 = await adapter.openTable('my_table');
      expect(table2).toBe(table);
      expect(mockClient.openTable).toHaveBeenCalledTimes(1);
    });

    it('openTable 表不存在时应创建', async () => {
      mockClient.openTable.mockRejectedValueOnce(new Error('not found'));
      const table = await adapter.openTable('new_table');
      expect(table).toBeDefined();
      expect(mockClient.createTable).toHaveBeenCalled();
    });

    it('createTable 应创建表', async () => {
      const data = [{ id: '1', name: 'test' }];
      await adapter.createTable('new_tbl', data);
      expect(mockClient.createTable).toHaveBeenCalledWith('new_tbl', data);
    });

    it('listTables 应返回表名列表', async () => {
      mockClient.tableNames.mockResolvedValueOnce(['a', 'b', 'c']);
      const tables = await adapter.listTables();
      expect(tables).toEqual(['a', 'b', 'c']);
    });

    it('dropTable 应删除表并清理缓存', async () => {
      await adapter.openTable('test');
      await adapter.dropTable('test');
      expect(mockClient.dropTable).toHaveBeenCalledWith('test');
    });
  });

  describe('数据操作', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('insert 应添加数据', async () => {
      const rows = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }];
      await adapter.insert('test', rows);
      expect(mockTable.add).toHaveBeenCalledWith(rows);
    });

    it('countRows 应返回行数', async () => {
      mockTable.countRows.mockResolvedValueOnce(42);
      const count = await adapter.countRows('test');
      expect(count).toBe(42);
    });

    it('deleteRows 应删除行', async () => {
      await adapter.deleteRows('test', "id = '1'");
      expect(mockTable.delete).toHaveBeenCalledWith("id = '1'");
    });
  });

  describe('查询操作', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('query 应返回查询结果', async () => {
      const expected = [{ id: '1', name: 'a' }];
      const qb = createMockQueryBuilder();
      qb.toArray.mockResolvedValue(expected);
      mockTable.query.mockReturnValue(qb);

      const result = await adapter.query('test', "name = 'a'", 10);
      expect(result).toEqual(expected);
      expect(qb.filter).toHaveBeenCalledWith("name = 'a'");
      expect(qb.limit).toHaveBeenCalledWith(10);
    });

    it('vectorSearch 应返回向量搜索结果', async () => {
      const expected = [{ id: '1', name: 'a', _distance: 0.1 }];
      const vs = createMockVectorSearch();
      vs.toArray.mockResolvedValue(expected);
      mockTable.vectorSearch.mockReturnValue(vs);

      const vector = [0.1, 0.2, 0.3];
      const result = await adapter.vectorSearch('test', vector, 5, "cat = 'x'");
      expect(result).toEqual(expected);
      expect(mockTable.vectorSearch).toHaveBeenCalledWith(vector);
      expect(vs.limit).toHaveBeenCalledWith(5);
      expect(vs.filter).toHaveBeenCalledWith("cat = 'x'");
    });
  });

  describe('exec - CREATE TABLE', () => {
    it('应触发 openTable', async () => {
      await adapter.connect();
      adapter.exec('CREATE TABLE IF NOT EXISTS test_tbl');
      // openTable 是异步的，这里 exec 内部用 void 调用
      // 等待一下让 Promise 完成
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockClient.openTable).toHaveBeenCalled();
    });

    it('不支持的 SQL 应抛出', async () => {
      await adapter.connect();
      expect(() => adapter.exec('DROP TABLE test')).toThrow('不支持的语句');
    });
  });

  describe('同步方法应抛出明确错误', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('prepare 应抛出', () => {
      expect(() => adapter.prepare('SELECT 1')).toThrow('不支持 SQL 预编译');
    });

    it('get 应抛出', () => {
      expect(() => adapter.get('SELECT 1')).toThrow('不支持 SQL 查询');
    });

    it('all 应抛出', () => {
      expect(() => adapter.all('SELECT 1')).toThrow('不支持 SQL 查询');
    });

    it('run 应抛出', () => {
      expect(() => adapter.run('SELECT 1')).toThrow('不支持 SQL 写入');
    });

    it('transaction 应抛出', () => {
      expect(() => adapter.transaction(() => 0)).toThrow('不支持事务');
    });
  });

  describe('migrateAsync / getVersionAsync', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('migrateAsync 应写入版本', async () => {
      const qb = createMockQueryBuilder();
      qb.toArray.mockResolvedValue([]);
      mockTable.query.mockReturnValue(qb);

      await adapter.migrateAsync('1.0.0', '');
      expect(mockTable.add).toHaveBeenCalled();
    });

    it('getVersionAsync 应返回版本号', async () => {
      const qb = createMockQueryBuilder();
      qb.toArray.mockResolvedValue([{ key: 'version', value: '2.0.0', _ts: 123 }]);
      mockTable.query.mockReturnValue(qb);

      const ver = await adapter.getVersionAsync();
      expect(ver).toBe('2.0.0');
    });

    it('getVersionAsync 无版本时返回 0.0.0', async () => {
      const qb = createMockQueryBuilder();
      qb.toArray.mockResolvedValue([]);
      mockTable.query.mockReturnValue(qb);

      const ver = await adapter.getVersionAsync();
      expect(ver).toBe('0.0.0');
    });
  });

  describe('未连接时操作应报错', () => {
    it('openTable 应抛出未连接错误', async () => {
      await expect(adapter.openTable('test')).rejects.toThrow('未连接');
    });

    it('exec 应抛出未连接错误', () => {
      expect(() => adapter.exec('SELECT 1')).toThrow('未连接');
    });
  });
});
