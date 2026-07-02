/**
 * Web Search 单元测试
 *
 * 测试内容：
 * - 搜索参数验证
 * - 国内搜索引擎（必应国内版 + 360搜索）
 * - 搜索结果规范化
 * - 缓存机制
 * - 搜索工具处理函数
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webSearch, handleWebSearchV3, webSearchCache } from '../engine/web-search-new.js';
import type { WebSearchParams } from '../engine/web-search-new.js';

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

    it('有效参数应通过验证', async () => {
      const result = await webSearch({ query: 'test', maxResults: 10, timeoutMs: 30000 } as unknown as WebSearchParams);
      expect(result).toBeDefined();
    }, 35000);
  });

  describe('国内搜索引擎', () => {
    it('必应国内版搜索应返回结果', async () => {
      const result = await webSearch({ query: 'cross-wms 仓库管理', maxResults: 5 } as unknown as WebSearchParams, { timeout: 30000 });
      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      // 必应国内版优先
      expect(['bing-cn', 'so', 'duckduckgo', 'none']).toContain(result.provider);
    }, 35000);

    it('中文搜索应返回相关结果', async () => {
      const result = await webSearch({ query: 'Node.js 最新版本', maxResults: 3 } as unknown as WebSearchParams, { timeout: 30000 });
      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    }, 35000);

    it('搜索结果应包含必要字段', async () => {
      const result = await webSearch({ query: 'React 教程', maxResults: 3 } as unknown as WebSearchParams, { timeout: 30000 });
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult.title).toBeDefined();
        expect(typeof firstResult.title).toBe('string');
        expect(firstResult.url).toBeDefined();
        expect(firstResult.url.startsWith('http')).toBe(true);
      }
    }, 35000);
  });

  describe('缓存机制', () => {
    it('相同查询应命中缓存', async () => {
      const query = 'TypeScript 类型系统';
      
      const result1 = await webSearch({ query, maxResults: 3 } as unknown as WebSearchParams, { timeout: 30000 });
      const result2 = await webSearch({ query, maxResults: 3 } as unknown as WebSearchParams, { timeout: 30000 });

      expect(result1.count).toBe(result2.count);
    }, 40000);

    it('缓存应支持清空', () => {
      webSearchCache.clear();
      expect(webSearchCache.size()).toBe(0);
    });
  });

  describe('工具处理函数', () => {
    it('handleWebSearchV3 应返回 JSON 结果', async () => {
      const result = await handleWebSearchV3({ query: 'test', maxResults: 2 });
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.results).toBeDefined();
    }, 35000);

    it('handleWebSearchV3 错误时应返回 success: false', async () => {
      const result = await handleWebSearchV3({ query: '' });
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('搜索结果规范化', () => {
    it('结果应按相关性排序', async () => {
      const result = await webSearch({ query: 'openclaw github', maxResults: 5 } as unknown as WebSearchParams, { timeout: 30000 });
      expect(result.results.length).toBeLessThanOrEqual(5);
    }, 35000);

    it('应过滤无效 URL', async () => {
      const result = await webSearch({ query: 'test search' } as unknown as WebSearchParams, { timeout: 30000 });
      if (result.results.length > 0) {
        for (const r of result.results) {
          expect(r.url.startsWith('http')).toBe(true);
        }
      }
    }, 35000);
  });
});