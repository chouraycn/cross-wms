/**
 * Web Search 熔断器 E2E 测试
 *
 * 测试内容：
 * - web_search 工具正常调用（真实网络请求）
 * - 熔断器状态流转（closed → half_open → open）
 * - 熔断器冷却恢复机制
 * - MCP Server 级熔断
 * - 搜索 Provider 结果解析验证
 *
 * 注意：使用真实网络请求测试必应国内版搜索引擎
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../../server/engine/circuitBreaker.js';
import { bingCnSearchProvider } from '../../server/plugins/search-provider-bing-cn.ts';
import { soSearchProvider } from '../../server/plugins/search-provider-360.ts';

const OPEN_COOLDOWN_MS = 60_000;

describe('Web Search 熔断器 E2E 测试', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker();
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('熔断器状态流转', () => {
    it('初始状态应为 closed', () => {
      expect(circuitBreaker.getState('web_search')).toBe('closed');
      expect(circuitBreaker.isOpen('web_search')).toBe(false);
      expect(circuitBreaker.isHalfOpen('web_search')).toBe(false);
    });

    it('连续 2 次失败后状态应为 half_open', () => {
      circuitBreaker.recordFailure('web_search', 'error 1');
      expect(circuitBreaker.getState('web_search')).toBe('closed');

      circuitBreaker.recordFailure('web_search', 'error 2');
      expect(circuitBreaker.getState('web_search')).toBe('half_open');
      expect(circuitBreaker.isHalfOpen('web_search')).toBe(true);
    });

    it('连续 3 次失败后状态应为 open（熔断）', () => {
      circuitBreaker.recordFailure('web_search', 'error 1');
      circuitBreaker.recordFailure('web_search', 'error 2');
      circuitBreaker.recordFailure('web_search', 'error 3');

      expect(circuitBreaker.getState('web_search')).toBe('open');
      expect(circuitBreaker.isOpen('web_search')).toBe(true);
    });

    it('成功一次后应重置为 closed', () => {
      circuitBreaker.recordFailure('web_search', 'error 1');
      circuitBreaker.recordFailure('web_search', 'error 2');
      expect(circuitBreaker.isHalfOpen('web_search')).toBe(true);

      circuitBreaker.recordSuccess('web_search');
      expect(circuitBreaker.getState('web_search')).toBe('closed');
    });

    it('熔断状态下应返回备选工具建议', () => {
      circuitBreaker.recordFailure('web_search', 'error 1');
      circuitBreaker.recordFailure('web_search', 'error 2');
      circuitBreaker.recordFailure('web_search', 'error 3');

      const suggestion = circuitBreaker.getAlternativeSuggestion('web_search');
      expect(suggestion).toBeTruthy();
      expect(suggestion).toContain('web_fetch');
    });

    it('冷却时间后应自动降级为 half_open', () => {
      circuitBreaker.recordFailure('test_tool', 'error 1');
      circuitBreaker.recordFailure('test_tool', 'error 2');
      circuitBreaker.recordFailure('test_tool', 'error 3');
      expect(circuitBreaker.isOpen('test_tool')).toBe(true);

      const record = (circuitBreaker as any).records.get('test_tool');
      record.openedAt = Date.now() - (OPEN_COOLDOWN_MS + 1000);

      expect(circuitBreaker.getState('test_tool')).toBe('half_open');
    });

    it('未到冷却时间应保持 open 状态', () => {
      circuitBreaker.recordFailure('test_tool', 'error 1');
      circuitBreaker.recordFailure('test_tool', 'error 2');
      circuitBreaker.recordFailure('test_tool', 'error 3');
      expect(circuitBreaker.isOpen('test_tool')).toBe(true);

      const record = (circuitBreaker as any).records.get('test_tool');
      record.openedAt = Date.now() - 1000;

      expect(circuitBreaker.getState('test_tool')).toBe('open');
    });
  });

  describe('熔断器记录验证', () => {
    it('熔断器记录应包含失败原因', () => {
      const reason = '测试失败原因';
      circuitBreaker.recordFailure('web_search', reason);

      const record = circuitBreaker.getRecord('web_search');
      expect(record).toBeTruthy();
      expect(record?.lastFailureReason).toBe(reason);
    });

    it('熔断器记录应包含连续失败次数', () => {
      circuitBreaker.recordFailure('web_search', 'error 1');
      circuitBreaker.recordFailure('web_search', 'error 2');

      const record = circuitBreaker.getRecord('web_search');
      expect(record?.consecutiveFailures).toBe(2);
    });

    it('熔断时应设置 openedAt 时间戳', () => {
      const before = Date.now();
      circuitBreaker.recordFailure('web_search', 'error 1');
      circuitBreaker.recordFailure('web_search', 'error 2');
      circuitBreaker.recordFailure('web_search', 'error 3');
      const after = Date.now();

      const record = circuitBreaker.getRecord('web_search');
      expect(record?.openedAt).toBeDefined();
      expect(record?.openedAt).toBeGreaterThanOrEqual(before);
      expect(record?.openedAt).toBeLessThanOrEqual(after);
    });

    it('重置后应清除所有熔断状态', () => {
      circuitBreaker.recordFailure('web_search', 'error 1');
      circuitBreaker.recordFailure('web_search', 'error 2');
      circuitBreaker.recordFailure('web_search', 'error 3');

      expect(circuitBreaker.isOpen('web_search')).toBe(true);

      circuitBreaker.reset();

      expect(circuitBreaker.getState('web_search')).toBe('closed');
      expect(circuitBreaker.getRecord('web_search')).toBeUndefined();
    });
  });

  describe('MCP Server 级熔断', () => {
    it('MCP Server 连续失败应触发 Server 级熔断', () => {
      circuitBreaker.recordMcpServerFailure('filesystem', 'error 1');
      circuitBreaker.recordMcpServerFailure('filesystem', 'error 2');
      circuitBreaker.recordMcpServerFailure('filesystem', 'error 3');

      expect(circuitBreaker.isMcpServerOpen('filesystem')).toBe(true);
    });

    it('MCP Server 成功后应重置熔断', () => {
      circuitBreaker.recordMcpServerFailure('test-server', 'error 1');
      circuitBreaker.recordMcpServerFailure('test-server', 'error 2');
      circuitBreaker.recordMcpServerFailure('test-server', 'error 3');

      expect(circuitBreaker.isMcpServerOpen('test-server')).toBe(true);

      circuitBreaker.recordMcpServerSuccess('test-server');
      expect(circuitBreaker.isMcpServerOpen('test-server')).toBe(false);
    });
  });

  describe('必应国内版搜索 Provider 验证', () => {
    it('应该能够创建搜索工具', () => {
      const tool = bingCnSearchProvider.createTool();
      expect(tool).toBeTruthy();
      expect(tool.execute).toBeInstanceOf(Function);
    });

    it('应该能够通过必应国内版搜索返回结果', async () => {
      const tool = bingCnSearchProvider.createTool();
      const result = await tool.execute({ query: 'vitest 单元测试框架', maxResults: 5 });

      expect(result).toBeTruthy();
      expect(result.count).toBeGreaterThan(0);
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.provider).toBeTruthy();

      for (const item of result.results) {
        expect(item.title).toBeTruthy();
        expect(item.url).toBeTruthy();
        expect(item.url).toMatch(/^https?:\/\//);
      }
    }, 30000);

    it('应该能够处理中文搜索查询', async () => {
      const tool = bingCnSearchProvider.createTool();
      const result = await tool.execute({ query: '人工智能大模型', maxResults: 3 });

      expect(result).toBeTruthy();
      expect(result.count).toBeGreaterThan(0);
    }, 30000);

    it('应该能够处理英文搜索查询', async () => {
      const tool = bingCnSearchProvider.createTool();
      const result = await tool.execute({ query: 'machine learning', maxResults: 3 });

      expect(result).toBeTruthy();
      expect(result.count).toBeGreaterThan(0);
    }, 30000);

    it('搜索结果标题应正确去除 HTML 标签', async () => {
      const tool = bingCnSearchProvider.createTool();
      const result = await tool.execute({ query: 'Speedtest 测速', maxResults: 5 });

      expect(result.count).toBeGreaterThan(0);
      for (const item of result.results) {
        expect(item.title).not.toContain('<');
        expect(item.title).not.toContain('>');
        expect(item.title).not.toContain('/strong');
      }
    }, 30000);
  });

  describe('360搜索 Provider 验证', () => {
    it('应该能够创建搜索工具', () => {
      const tool = soSearchProvider.createTool();
      expect(tool).toBeTruthy();
      expect(tool.execute).toBeInstanceOf(Function);
    });

    it('应该能够通过 360 搜索返回结果', async () => {
      const tool = soSearchProvider.createTool();
      let result;
      try {
        result = await tool.execute({ query: 'TypeScript 教程', maxResults: 5 });
      } catch (e) {
        // 360 搜索可能触发反爬拦截，属于外部服务限制，非代码问题
        if (e instanceof Error && e.message.includes('反爬拦截')) {
          console.log('360搜索反爬拦截，跳过此测试');
          return;
        }
        throw e;
      }

      expect(result).toBeTruthy();
      expect(result.count).toBeGreaterThan(0);
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThan(0);

      for (const item of result.results) {
        expect(item.title).toBeTruthy();
        expect(item.url).toBeTruthy();
        expect(item.url).toMatch(/^https?:\/\//);
      }
    }, 30000);

    it('搜索结果标题应正确去除 HTML 标签', async () => {
      const tool = soSearchProvider.createTool();
      let result;
      try {
        result = await tool.execute({ query: 'React 框架', maxResults: 5 });
      } catch (e) {
        if (e instanceof Error && e.message.includes('反爬拦截')) {
          console.log('360搜索反爬拦截，跳过此测试');
          return;
        }
        throw e;
      }

      expect(result.count).toBeGreaterThan(0);
      for (const item of result.results) {
        expect(item.title).not.toContain('<');
        expect(item.title).not.toContain('>');
        expect(item.title).not.toContain('/em');
      }
    }, 30000);
  });

  describe('熔断器与搜索集成场景', () => {
    it('搜索成功不应影响熔断器状态', async () => {
      const initialState = circuitBreaker.getState('web_search');

      const tool = bingCnSearchProvider.createTool();
      const result = await tool.execute({ query: '测试搜索', maxResults: 3 });

      expect(result.count).toBeGreaterThan(0);
      expect(circuitBreaker.getState('web_search')).toBe(initialState);
    }, 30000);

    it('多次搜索成功后熔断器仍为 closed', async () => {
      const tool = bingCnSearchProvider.createTool();

      await tool.execute({ query: '查询1', maxResults: 2 });
      await tool.execute({ query: '查询2', maxResults: 2 });
      await tool.execute({ query: '查询3', maxResults: 2 });

      expect(circuitBreaker.getState('web_search')).toBe('closed');
    }, 60000);
  });
});
