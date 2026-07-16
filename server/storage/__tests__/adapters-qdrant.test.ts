import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QdrantAdapter } from '../adapters/QdrantAdapter.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

interface FetchMock {
  mock: ReturnType<typeof vi.fn>;
}

let mockFetch: ReturnType<typeof vi.fn>;
let mockResponse: {
  ok: boolean;
  status: number;
  statusText: string;
  json: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
};

function createMockResponse(
  result: unknown,
  ok = true,
  status = 200,
): typeof mockResponse {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue({
      result,
      status: 'ok',
      time: 0.001,
    }),
    text: vi.fn().mockResolvedValue(JSON.stringify({
      result,
      status: 'ok',
      time: 0.001,
    })),
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('QdrantAdapter', () => {
  let adapter: QdrantAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse = createMockResponse({ health: 'ok' });
    mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch as unknown as typeof fetch;
    adapter = new QdrantAdapter({
      url: 'http://localhost:6333',
      apiKey: 'test-key',
    });
  });

  describe('构造函数', () => {
    it('应该正确创建实例', () => {
      expect(adapter).toBeInstanceOf(QdrantAdapter);
    });

    it('初始状态未连接', () => {
      expect(adapter.isConnected()).toBe(false);
    });

    it('应该去除 URL 末尾斜杠', () => {
      const a = new QdrantAdapter({ url: 'http://localhost:6333/' });
      expect(a).toBeInstanceOf(QdrantAdapter);
    });
  });

  describe('connect', () => {
    it('应该通过 health check 验证连接', async () => {
      mockResponse = createMockResponse({ health: 'ok' });
      mockFetch.mockResolvedValue(mockResponse);

      await adapter.connect();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/healthz',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(adapter.isConnected()).toBe(true);
    });

    it('health check 失败时应抛出', async () => {
      mockResponse = createMockResponse({ health: 'degraded' }, false, 503);
      mockFetch.mockResolvedValue(mockResponse);

      await expect(adapter.connect()).rejects.toThrow('Qdrant 连接失败');
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('应该标记为未连接', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('集合操作', () => {
    beforeEach(async () => {
      await adapter.connect();
      mockResponse = createMockResponse({});
      mockFetch.mockResolvedValue(mockResponse);
    });

    it('createCollection 应发送正确的 PUT 请求', async () => {
      await adapter.createCollection('test_coll', 1536, 'Cosine');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/test_coll',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            vectors: { size: 1536, distance: 'Cosine' },
          }),
        }),
      );
    });

    it('deleteCollection 应发送 DELETE 请求', async () => {
      await adapter.deleteCollection('test_coll');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/test_coll',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('getCollectionInfo 应返回集合信息', async () => {
      const info = { name: 'test', points_count: 100, vectors_count: 100, status: 'green' };
      mockResponse = createMockResponse(info);
      mockFetch.mockResolvedValue(mockResponse);

      const result = await adapter.getCollectionInfo('test');
      expect(result.name).toBe('test');
      expect(result.points_count).toBe(100);
    });

    it('listCollections 应返回集合名列表', async () => {
      const colls = [{ name: 'a' }, { name: 'b' }];
      mockResponse = createMockResponse({ collections: colls });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await adapter.listCollections();
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('向量点操作', () => {
    beforeEach(async () => {
      await adapter.connect();
      mockResponse = createMockResponse({});
      mockFetch.mockResolvedValue(mockResponse);
    });

    it('upsertPoints 应发送 PUT 请求', async () => {
      const points = [
        { id: '1', vector: [1, 2, 3], payload: { name: 'test' } },
      ];
      mockResponse = createMockResponse({ operation_id: 1, status: 'completed' });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await adapter.upsertPoints('coll', points);
      expect(result.operationId).toBe(1);
      expect(result.status).toBe('completed');
    });

    it('getPoint 应返回点数据', async () => {
      const point = { id: '1', vector: [1, 2, 3], payload: { name: 'x' } };
      mockResponse = createMockResponse(point);
      mockFetch.mockResolvedValue(mockResponse);

      const result = await adapter.getPoint('coll', '1');
      expect(result?.id).toBe('1');
    });

    it('getPoint 不存在时返回 undefined', async () => {
      mockFetch.mockRejectedValueOnce(new Error('not found'));
      const result = await adapter.getPoint('coll', '999');
      expect(result).toBeUndefined();
    });

    it('deletePoints 应发送 DELETE 请求', async () => {
      mockResponse = createMockResponse({ operation_id: 2, status: 'acknowledged' });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await adapter.deletePoints('coll', ['1', '2']);
      expect(result.operationId).toBe(2);
    });

    it('countPoints 应返回数量', async () => {
      mockResponse = createMockResponse({ count: 42 });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await adapter.countPoints('coll');
      expect(result).toBe(42);
    });
  });

  describe('向量搜索', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('search 应返回搜索结果', async () => {
      const results = [
        { id: '1', version: 1, score: 0.95, payload: { name: 'a' } },
        { id: '2', version: 1, score: 0.85, payload: { name: 'b' } },
      ];
      mockResponse = createMockResponse(results);
      mockFetch.mockResolvedValue(mockResponse);

      const vector = [0.1, 0.2, 0.3];
      const searchResults = await adapter.search('coll', vector, 10);
      expect(searchResults).toHaveLength(2);
      expect(searchResults[0].score).toBe(0.95);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/coll/points/search',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            vector,
            limit: 10,
            filter: undefined,
            with_payload: true,
            with_vector: false,
          }),
        }),
      );
    });

    it('search 带 filter 和 withVector', async () => {
      mockResponse = createMockResponse([]);
      mockFetch.mockResolvedValue(mockResponse);

      const vector = [1, 2];
      const filter = { must: [{ key: 'cat', match: { value: 'tools' } }] };
      await adapter.search('coll', vector, 5, filter, true, true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/search'),
        expect.objectContaining({
          body: JSON.stringify({
            vector,
            limit: 5,
            filter,
            with_payload: true,
            with_vector: true,
          }),
        }),
      );
    });
  });

  describe('API key 认证', () => {
    it('应该在请求头中包含 api-key', async () => {
      await adapter.connect();
      mockResponse = createMockResponse({ collections: [] });
      mockFetch.mockResolvedValue(mockResponse);

      await adapter.listCollections();
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const headers = lastCall[1].headers as Record<string, string>;
      expect(headers['api-key']).toBe('test-key');
    });

    it('无 apiKey 时不包含请求头', async () => {
      const a = new QdrantAdapter({ url: 'http://localhost:6333' });
      mockResponse = createMockResponse({ health: 'ok' });
      mockFetch.mockResolvedValue(mockResponse);
      await a.connect();

      mockResponse = createMockResponse({ collections: [] });
      mockFetch.mockResolvedValue(mockResponse);
      await a.listCollections();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const headers = lastCall[1].headers as Record<string, string>;
      expect(headers['api-key']).toBeUndefined();
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
});
