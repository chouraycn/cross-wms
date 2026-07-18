/**
 * Search Runtime 单元测试
 *
 * 测试搜索运行时的查询验证、缓存、Provider 选择、回退等功能。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchRuntime } from '../runtime.js';
import { registerProvider, resetRegistry } from '../provider-registry.js';
import type { SearchProvider, SearchQuery, SearchOptions, SearchResultList } from '../types.js';

vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Search Runtime', () => {
  let runtime: SearchRuntime;

  beforeEach(() => {
    resetRegistry();
    runtime = new SearchRuntime();
  });

  describe('配置管理', () => {
    it('应使用默认配置初始化', () => {
      const config = runtime.getConfig();
      expect(config.defaultTimeoutMs).toBe(15000);
      expect(config.cacheEnabled).toBe(true);
      expect(config.domesticFirst).toBe(true);
    });

    it('应能更新配置', () => {
      runtime.setConfig({ defaultTimeoutMs: 30000, cacheEnabled: false });
      const config = runtime.getConfig();
      expect(config.defaultTimeoutMs).toBe(30000);
      expect(config.cacheEnabled).toBe(false);
    });

    it('更新 maxCacheSize 应重置缓存', () => {
      runtime.setConfig({ maxCacheSize: 10 });
      expect(runtime.getCacheSize()).toBe(0);
    });
  });

  describe('查询验证', () => {
    it('空查询应抛出错误', async () => {
      await expect(runtime.search({ query: '' })).rejects.toThrow();
    });

    it('纯空白查询应抛出错误', async () => {
      await expect(runtime.search({ query: '   ' })).rejects.toThrow();
    });

    it('超长查询应抛出错误', async () => {
      const longQuery = 'a'.repeat(2000);
      await expect(runtime.search({ query: longQuery })).rejects.toThrow();
    });

    it('maxResults 小于 1 应抛出错误', async () => {
      await expect(runtime.search({ query: 'test', maxResults: 0 })).rejects.toThrow();
    });

    it('maxResults 大于 50 应抛出错误', async () => {
      await expect(runtime.search({ query: 'test', maxResults: 51 })).rejects.toThrow();
    });

    it('有效查询应正常执行', async () => {
      const mockProvider: SearchProvider = {
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn().mockResolvedValue({
          query: 'test',
          results: [{ title: 'Result 1', url: 'https://a.com' }],
          count: 1,
          provider: 'test-provider',
        }),
        isAvailable: () => true,
      };

      registerProvider({
        id: 'test-provider',
        factory: () => mockProvider,
        isDomestic: true,
        defaultPriority: 1,
      });

      const result = await runtime.search({ query: 'test', maxResults: 10 });
      expect(result).toBeDefined();
      expect(result.query).toBe('test');
      expect(result.count).toBe(1);
    });
  });

  describe('缓存功能', () => {
    let mockSearch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSearch = vi.fn().mockResolvedValue({
        query: 'cache-test',
        results: [{ title: 'Cached Result', url: 'https://cached.com' }],
        count: 1,
        provider: 'test-provider',
      });

      const mockProvider: SearchProvider = {
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: mockSearch,
        isAvailable: () => true,
      };

      registerProvider({
        id: 'test-provider',
        factory: () => mockProvider,
        isDomestic: true,
        defaultPriority: 1,
      });
    });

    it('相同查询应命中缓存', async () => {
      await runtime.search({ query: 'cache-test' });
      await runtime.search({ query: 'cache-test' });

      expect(mockSearch).toHaveBeenCalledTimes(1);
    });

    it('缓存结果应标记 cached 为 true', async () => {
      const result1 = await runtime.search({ query: 'cache-test' });
      const result2 = await runtime.search({ query: 'cache-test' });

      expect(result1.cached).not.toBe(true);
      expect(result2.cached).toBe(true);
    });

    it('不同查询不应命中缓存', async () => {
      await runtime.search({ query: 'cache-test-1' });
      await runtime.search({ query: 'cache-test-2' });

      expect(mockSearch).toHaveBeenCalledTimes(2);
    });

    it('useCache: false 应禁用缓存', async () => {
      await runtime.search({ query: 'cache-test' }, { useCache: false });
      await runtime.search({ query: 'cache-test' }, { useCache: false });

      expect(mockSearch).toHaveBeenCalledTimes(2);
    });

    it('clearCache 应清除所有缓存', async () => {
      await runtime.search({ query: 'cache-test' });
      expect(runtime.getCacheSize()).toBeGreaterThan(0);

      runtime.clearCache();
      expect(runtime.getCacheSize()).toBe(0);
    });
  });

  describe('Provider 选择', () => {
    it('preferredProviders 应优先使用', async () => {
      const mockSearch1 = vi.fn().mockResolvedValue({
        query: 'test',
        results: [{ title: 'Result 1', url: 'https://a.com' }],
        count: 1,
        provider: 'provider-1',
      });

      const mockSearch2 = vi.fn().mockResolvedValue({
        query: 'test',
        results: [{ title: 'Result 2', url: 'https://b.com' }],
        count: 1,
        provider: 'provider-2',
      });

      registerProvider({
        id: 'provider-1',
        factory: () => ({
          id: 'provider-1',
          name: 'Provider 1',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 10,
          search: mockSearch1,
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 10,
      });

      registerProvider({
        id: 'provider-2',
        factory: () => ({
          id: 'provider-2',
          name: 'Provider 2',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 1,
          search: mockSearch2,
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 1,
      });

      const result = await runtime.search(
        { query: 'test' },
        { preferredProviders: ['provider-1'] },
      );

      expect(result.provider).toBe('provider-1');
    });

    it('国内优先模式下国内 Provider 应优先', async () => {
      const domesticMock = vi.fn().mockResolvedValue({
        query: 'test',
        results: [{ title: 'Domestic', url: 'https://domestic.com' }],
        count: 1,
        provider: 'domestic-provider',
      });

      const internationalMock = vi.fn().mockResolvedValue({
        query: 'test',
        results: [{ title: 'International', url: 'https://intl.com' }],
        count: 1,
        provider: 'intl-provider',
      });

      registerProvider({
        id: 'intl-provider',
        factory: () => ({
          id: 'intl-provider',
          name: 'Intl',
          description: '',
          isDomestic: false,
          supportsRegions: [],
          defaultPriority: 1,
          search: internationalMock,
          isAvailable: () => true,
        }),
        isDomestic: false,
        defaultPriority: 1,
      });

      registerProvider({
        id: 'domestic-provider',
        factory: () => ({
          id: 'domestic-provider',
          name: 'Domestic',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 10,
          search: domesticMock,
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 10,
      });

      const result = await runtime.search({ query: 'test' });
      expect(result.provider).toBe('domestic-provider');
    });
  });

  describe('回退功能', () => {
    it('Provider 失败时应回退到下一个', async () => {
      const failingMock = vi.fn().mockRejectedValue(new Error('Provider failed'));
      const workingMock = vi.fn().mockResolvedValue({
        query: 'test',
        results: [{ title: 'Fallback Result', url: 'https://fallback.com' }],
        count: 1,
        provider: 'fallback-provider',
      });

      registerProvider({
        id: 'failing-provider',
        factory: () => ({
          id: 'failing-provider',
          name: 'Failing',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 1,
          search: failingMock,
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 1,
      });

      registerProvider({
        id: 'fallback-provider',
        factory: () => ({
          id: 'fallback-provider',
          name: 'Fallback',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 2,
          search: workingMock,
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 2,
      });

      const result = await runtime.search({ query: 'test' });
      expect(result.provider).toBe('fallback-provider');
      expect(result.providersUsed).toContain('failing-provider');
      expect(result.providersUsed).toContain('fallback-provider');
    });

    it('所有 Provider 都失败时应抛出错误', async () => {
      registerProvider({
        id: 'failing-1',
        factory: () => ({
          id: 'failing-1',
          name: 'Failing 1',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 1,
          search: vi.fn().mockRejectedValue(new Error('Error 1')),
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 1,
      });

      registerProvider({
        id: 'failing-2',
        factory: () => ({
          id: 'failing-2',
          name: 'Failing 2',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 2,
          search: vi.fn().mockRejectedValue(new Error('Error 2')),
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 2,
      });

      await expect(runtime.search({ query: 'test' })).rejects.toThrow();
    });

    it('fallbackEnabled: false 应禁用回退', async () => {
      registerProvider({
        id: 'failing-provider',
        factory: () => ({
          id: 'failing-provider',
          name: 'Failing',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 1,
          search: vi.fn().mockRejectedValue(new Error('Error')),
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 1,
      });

      registerProvider({
        id: 'working-provider',
        factory: () => ({
          id: 'working-provider',
          name: 'Working',
          description: '',
          isDomestic: true,
          supportsRegions: [],
          defaultPriority: 2,
          search: vi.fn().mockResolvedValue({
            query: 'test',
            results: [],
            count: 0,
            provider: 'working-provider',
          }),
          isAvailable: () => true,
        }),
        isDomestic: true,
        defaultPriority: 2,
      });

      await expect(
        runtime.search({ query: 'test' }, { fallbackEnabled: false }),
      ).rejects.toThrow();
    });
  });

  describe('结果规范化', () => {
    it('应过滤掉无效结果', async () => {
      const mockProvider: SearchProvider = {
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn().mockResolvedValue({
          query: 'test',
          results: [
            { title: 'Valid', url: 'https://valid.com' },
            { title: '', url: 'https://no-title.com' },
            { title: 'No URL', url: '' },
          ],
          count: 3,
          provider: 'test-provider',
        }),
        isAvailable: () => true,
      };

      registerProvider({
        id: 'test-provider',
        factory: () => mockProvider,
        isDomestic: true,
        defaultPriority: 1,
      });

      const result = await runtime.search({ query: 'test' });
      expect(result.count).toBe(1);
      expect(result.results[0].title).toBe('Valid');
    });

    it('应去除标题和 URL 的首尾空白', async () => {
      const mockProvider: SearchProvider = {
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn().mockResolvedValue({
          query: 'test',
          results: [
            { title: '  Padded Title  ', url: '  https://padded.com  ' },
          ],
          count: 1,
          provider: 'test-provider',
        }),
        isAvailable: () => true,
      };

      registerProvider({
        id: 'test-provider',
        factory: () => mockProvider,
        isDomestic: true,
        defaultPriority: 1,
      });

      const result = await runtime.search({ query: 'test' });
      expect(result.results[0].title).toBe('Padded Title');
      expect(result.results[0].url).toBe('https://padded.com');
    });
  });

  describe('结果合并', () => {
    it('应合并多个结果列表并去重', () => {
      const results1: SearchResultList = {
        query: 'test',
        results: [
          { title: 'Result 1', url: 'https://a.com/page' },
          { title: 'Result 2', url: 'https://b.com' },
        ],
        count: 2,
        provider: 'provider-1',
      };

      const results2: SearchResultList = {
        query: 'test',
        results: [
          { title: 'Result 3', url: 'https://a.com/page/' },
          { title: 'Result 4', url: 'https://c.com' },
        ],
        count: 2,
        provider: 'provider-2',
      };

      const merged = runtime.mergeResults([results1, results2]);
      expect(merged.length).toBe(3);
    });
  });

  describe('性能指标', () => {
    it('应返回搜索耗时', async () => {
      const mockProvider: SearchProvider = {
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn().mockResolvedValue({
          query: 'test',
          results: [{ title: 'Result', url: 'https://test.com' }],
          count: 1,
          provider: 'test-provider',
        }),
        isAvailable: () => true,
      };

      registerProvider({
        id: 'test-provider',
        factory: () => mockProvider,
        isDomestic: true,
        defaultPriority: 1,
      });

      const result = await runtime.search({ query: 'test' });
      expect(result.durationMs).toBeDefined();
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
