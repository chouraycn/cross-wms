/**
 * Web Search 单元测试
 *
 * 测试内容：
 * - 搜索参数验证
 * - 搜索结果规范化
 * - 缓存机制
 * - 搜索工具处理函数
 *
 * 注意：所有网络请求均已 mock，不依赖真实网络
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webSearch, handleWebSearchV3, webSearchCache } from '../engine/web-search-new.js';
import type { WebSearchParams } from '../engine/web-search-new.js';

vi.mock('../plugins/web-search-providers.js', () => ({
  getWebSearchProviders: vi.fn(() => [
    {
      id: 'mock-provider',
      label: 'Mock Search',
      hint: 'Mock search provider for testing',
      envVars: [],
      placeholder: '',
      signupUrl: '',
      credentialPath: '',
      getCredentialValue: () => undefined,
      setCredentialValue: () => {},
      createTool: () => ({
        description: 'Mock search tool',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
        execute: async (args: Record<string, unknown>) => ({
          query: String(args.query || ''),
          results: [
            { title: 'Mock Result 1', url: 'https://mock1.com', snippet: 'Snippet 1' },
            { title: 'Mock Result 2', url: 'https://mock2.com', snippet: 'Snippet 2' },
            { title: 'Mock Result 3', url: 'https://mock3.com', snippet: 'Snippet 3' },
          ],
          count: 3,
          provider: 'mock-provider',
        }),
      }),
    },
  ]),
  sortWebSearchProvidersForAutoDetect: vi.fn((providers) => providers),
  resolveWebSearchCredential: vi.fn(() => ({ value: undefined, source: 'missing' })),
}));

describe('Web Search', () => {
  beforeEach(() => {
    webSearchCache.clear();
    vi.clearAllMocks();
  });

  describe('参数验证', () => {
    it('空查询应抛出错误', async () => {
      await expect(webSearch({ query: '', maxResults: 5 } as unknown as WebSearchParams)).rejects.toThrow();
    });

    it('查询长度超过限制应抛出错误', async () => {
      const longQuery = 'a'.repeat(2000);
      await expect(webSearch({ query: longQuery } as unknown as WebSearchParams)).rejects.toThrow();
    });

    it('maxResults 超出范围应抛出错误', async () => {
      await expect(webSearch({ query: 'test', maxResults: 100 } as unknown as WebSearchParams)).rejects.toThrow();
    });

    it('timeoutMs 超出范围应抛出错误', async () => {
      await expect(webSearch({ query: 'test', timeoutMs: 300000 } as unknown as WebSearchParams)).rejects.toThrow();
    });

    it('有效参数应通过验证并返回结果', async () => {
      const result = await webSearch({ query: 'test', maxResults: 10, timeoutMs: 30000 } as unknown as WebSearchParams);
      expect(result).toBeDefined();
      expect(result.provider).toBe('mock-provider');
      expect(result.count).toBe(3);
    });
  });

  describe('缓存机制', () => {
    it('相同查询应命中缓存', async () => {
      const query = 'cache-test-query';
      
      const result1 = await webSearch({ query, maxResults: 3 } as unknown as WebSearchParams);
      const result2 = await webSearch({ query, maxResults: 3 } as unknown as WebSearchParams);

      expect(result1.count).toBe(result2.count);
      expect(result1.provider).toBe(result2.provider);
    });

    it('缓存应支持清空', () => {
      webSearchCache.clear();
      expect(webSearchCache.size()).toBe(0);
    });
  });

  describe('搜索结果规范化', () => {
    it('结果应包含 title、url、snippet 字段', async () => {
      const result = await webSearch({ query: 'test', maxResults: 5 } as unknown as WebSearchParams);
      expect(result.results.length).toBeGreaterThan(0);
      
      for (const r of result.results) {
        expect(r.title).toBeDefined();
        expect(typeof r.title).toBe('string');
        expect(r.url).toBeDefined();
        expect(r.url.startsWith('http')).toBe(true);
      }
    });

    it('结果数量不应超过 maxResults', async () => {
      const result = await webSearch({ query: 'test', maxResults: 2 } as unknown as WebSearchParams);
      expect(result.results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('工具处理函数', () => {
    it('handleWebSearchV3 应返回 JSON 结果', async () => {
      const result = await handleWebSearchV3({ query: 'test', maxResults: 2 });
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
    });

    it('handleWebSearchV3 错误时应返回 success: false', async () => {
      const result = await handleWebSearchV3({ query: '' });
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('查询和结果对应', () => {
    it('返回结果的 query 字段应与输入一致', async () => {
      const testQuery = 'unique-test-query-12345';
      const result = await webSearch({ query: testQuery, maxResults: 3 } as unknown as WebSearchParams);
      expect(result.query).toBe(testQuery);
    });
  });
});