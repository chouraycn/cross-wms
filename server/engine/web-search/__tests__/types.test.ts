/**
 * Web Search Types 单元测试
 *
 * 测试类型定义和默认配置。
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SEARCH_CONFIG,
  type SearchResult,
  type SearchQuery,
  type SearchOptions,
  type SearchResultList,
  type SearchProvider,
  type SearchRuntimeConfig,
} from '../types.js';

describe('Web Search Types', () => {
  describe('DEFAULT_SEARCH_CONFIG', () => {
    it('应包含所有必需的配置项', () => {
      expect(DEFAULT_SEARCH_CONFIG).toBeDefined();
      expect(DEFAULT_SEARCH_CONFIG.defaultTimeoutMs).toBe(15000);
      expect(DEFAULT_SEARCH_CONFIG.defaultCacheTtlMs).toBe(5 * 60 * 1000);
      expect(DEFAULT_SEARCH_CONFIG.cacheEnabled).toBe(true);
      expect(DEFAULT_SEARCH_CONFIG.maxCacheSize).toBe(500);
      expect(DEFAULT_SEARCH_CONFIG.defaultMaxResults).toBe(10);
      expect(DEFAULT_SEARCH_CONFIG.domesticFirst).toBe(true);
      expect(DEFAULT_SEARCH_CONFIG.fallbackEnabled).toBe(true);
      expect(DEFAULT_SEARCH_CONFIG.maxFallbackRetries).toBe(3);
    });

    it('默认配置应为 SearchRuntimeConfig 类型', () => {
      const config: SearchRuntimeConfig = DEFAULT_SEARCH_CONFIG;
      expect(config).toBeDefined();
    });
  });

  describe('类型定义', () => {
    it('SearchResult 应包含必需字段', () => {
      const result: SearchResult = {
        title: '测试标题',
        url: 'https://example.com',
        snippet: '测试摘要',
      };
      expect(result.title).toBe('测试标题');
      expect(result.url).toBe('https://example.com');
      expect(result.snippet).toBe('测试摘要');
    });

    it('SearchResult 可选字段应能正常设置', () => {
      const result: SearchResult = {
        title: '测试标题',
        url: 'https://example.com',
        source: 'baidu',
        language: 'zh',
        publishedAt: '2024-01-01',
      };
      expect(result.source).toBe('baidu');
      expect(result.language).toBe('zh');
      expect(result.publishedAt).toBe('2024-01-01');
    });

    it('SearchQuery 应支持各种查询参数', () => {
      const query: SearchQuery = {
        query: '测试查询',
        maxResults: 20,
        language: 'zh-CN',
        region: 'CN',
        timeRange: 'week',
        safeSearch: true,
      };
      expect(query.query).toBe('测试查询');
      expect(query.maxResults).toBe(20);
      expect(query.language).toBe('zh-CN');
      expect(query.region).toBe('CN');
      expect(query.timeRange).toBe('week');
      expect(query.safeSearch).toBe(true);
    });

    it('SearchOptions 应支持各种选项', () => {
      const controller = new AbortController();
      const options: SearchOptions = {
        timeoutMs: 10000,
        useCache: true,
        cacheTtlMs: 60000,
        signal: controller.signal,
        preferredProviders: ['baidu', 'bing-cn'],
        fallbackEnabled: true,
        maxFallbackRetries: 3,
      };
      expect(options.timeoutMs).toBe(10000);
      expect(options.useCache).toBe(true);
      expect(options.preferredProviders).toEqual(['baidu', 'bing-cn']);
    });

    it('SearchResultList 应包含结果列表', () => {
      const resultList: SearchResultList = {
        query: '测试',
        results: [
          { title: '结果1', url: 'https://a.com' },
          { title: '结果2', url: 'https://b.com' },
        ],
        count: 2,
        provider: 'baidu',
      };
      expect(resultList.results.length).toBe(2);
      expect(resultList.count).toBe(2);
      expect(resultList.provider).toBe('baidu');
    });
  });

  describe('SearchProvider 接口', () => {
    it('应能创建符合接口的 Provider 对象', () => {
      const provider: SearchProvider = {
        id: 'test-provider',
        name: '测试 Provider',
        description: '用于测试的搜索 Provider',
        isDomestic: true,
        supportsRegions: ['zh-CN'],
        defaultPriority: 1,
        async search(query) {
          return {
            query: query.query,
            results: [],
            count: 0,
            provider: 'test-provider',
          };
        },
        isAvailable() {
          return true;
        },
      };

      expect(provider.id).toBe('test-provider');
      expect(provider.isDomestic).toBe(true);
      expect(typeof provider.search).toBe('function');
      expect(typeof provider.isAvailable).toBe('function');
    });
  });
});
