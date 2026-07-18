import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import {
  createMarketplaceClient,
  seedMarketplaceCache,
  clearMarketplaceCache,
  getMarketplaceCacheSize,
} from '../marketplace.js';
import type { MarketplaceEntry, MarketplaceRating } from '../types.js';

function makeEntry(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    id: 'demo-plugin',
    name: 'Demo Plugin',
    description: 'A demo plugin',
    version: '1.0.0',
    author: 'demo',
    downloads: 100,
    rating: 4.5,
    ratingCount: 10,
    categories: ['productivity'],
    publishedAt: Date.now() - 86_400_000,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('plugins/marketplace', () => {
  beforeEach(() => {
    clearMarketplaceCache();
  });

  describe('createMarketplaceClient (本地缓存路径)', () => {
    it('seedMarketplaceCache 注入缓存后可被搜索', async () => {
      seedMarketplaceCache([
        makeEntry({ id: 'p1', name: 'Alpha', downloads: 10 }),
        makeEntry({ id: 'p2', name: 'Beta', downloads: 50 }),
      ]);
      const client = createMarketplaceClient();
      const result = await client.search({ keyword: 'alpha' });
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].id).toBe('p1');
    });

    it('按 downloads 降序排序（默认）', async () => {
      seedMarketplaceCache([
        makeEntry({ id: 'p1', name: 'low', downloads: 10 }),
        makeEntry({ id: 'p2', name: 'high', downloads: 1000 }),
      ]);
      const client = createMarketplaceClient();
      const result = await client.search({});
      expect(result.entries[0].downloads).toBe(1000);
      expect(result.entries[1].downloads).toBe(10);
    });

    it('按 rating 排序', async () => {
      seedMarketplaceCache([
        makeEntry({ id: 'p1', rating: 3.0 }),
        makeEntry({ id: 'p2', rating: 5.0 }),
      ]);
      const client = createMarketplaceClient();
      const result = await client.search({ sortBy: 'rating', order: 'asc' });
      expect(result.entries[0].rating).toBe(3.0);
      expect(result.entries[1].rating).toBe(5.0);
    });

    it('分页生效', async () => {
      seedMarketplaceCache([
        makeEntry({ id: 'p1' }),
        makeEntry({ id: 'p2' }),
        makeEntry({ id: 'p3' }),
      ]);
      const client = createMarketplaceClient();
      const page1 = await client.search({ limit: 2, offset: 0 });
      expect(page1.entries.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      const page2 = await client.search({ limit: 2, offset: 2 });
      expect(page2.entries.length).toBe(1);
    });

    it('按 category 过滤', async () => {
      seedMarketplaceCache([
        makeEntry({ id: 'p1', categories: ['network'] }),
        makeEntry({ id: 'p2', categories: ['productivity'] }),
      ]);
      const client = createMarketplaceClient();
      const result = await client.search({ category: 'network' });
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].id).toBe('p1');
    });

    it('fetchEntry 命中缓存', async () => {
      seedMarketplaceCache([makeEntry({ id: 'p1' })]);
      const client = createMarketplaceClient();
      const entry = await client.fetchEntry('p1');
      expect(entry?.id).toBe('p1');
    });
  });

  describe('createMarketplaceClient (远程路径)', () => {
    it('search 远程返回数据时缓存到本地', async () => {
      const fetchClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          entries: [makeEntry({ id: 'remote-1' })],
          total: 1,
        }),
      });
      const client = createMarketplaceClient(fetchClient as never, 'https://test.example/api');
      const result = await client.search({});
      expect(result.entries.length).toBe(1);
      expect(fetchClient).toHaveBeenCalled();
      // 二次调用应该命中缓存（fetchClient 仅被调用一次）
      const beforeSize = getMarketplaceCacheSize();
      await client.search({});
      expect(getMarketplaceCacheSize()).toBe(beforeSize);
    });

    it('fetchEntry 远程返回数据后缓存', async () => {
      const fetchClient = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeEntry({ id: 'remote-2' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({}),
        });
      const client = createMarketplaceClient(fetchClient as never);
      const entry = await client.fetchEntry('remote-2');
      expect(entry?.id).toBe('remote-2');
      // 第二次走缓存，不会触发 fetch
      await client.fetchEntry('remote-2');
      expect(fetchClient).toHaveBeenCalledTimes(1);
    });

    it('download 失败时抛错', async () => {
      const fetchClient = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
      const client = createMarketplaceClient(fetchClient as never);
      await expect(client.download('p1')).rejects.toThrow(/download failed/);
    });

    it('submitRating 更新缓存中的评分', async () => {
      seedMarketplaceCache([makeEntry({ id: 'p1', rating: 4.0, ratingCount: 2 })]);
      const fetchClient = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      const client = createMarketplaceClient(fetchClient as never);
      const rating: MarketplaceRating = {
        pluginId: 'p1',
        score: 5,
        userId: 'u1',
        createdAt: Date.now(),
      };
      await client.submitRating(rating);
      const entry = await client.fetchEntry('p1');
      // (4.0 * 2 + 5) / 3 = 4.333...
      expect(entry?.ratingCount).toBe(3);
      expect(entry?.rating).toBeCloseTo(4.333, 2);
      expect(fetchClient).toHaveBeenCalled();
    });
  });

  describe('cache 管理', () => {
    it('clearMarketplaceCache 清空缓存', () => {
      seedMarketplaceCache([makeEntry({ id: 'p1' })]);
      expect(getMarketplaceCacheSize()).toBe(1);
      clearMarketplaceCache();
      expect(getMarketplaceCacheSize()).toBe(0);
    });
  });
});
