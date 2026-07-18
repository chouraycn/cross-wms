/**
 * tool-executor 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutor } from '../tool-executor.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor();
  });

  describe('registerTool', () => {
    it('应该成功注册工具', () => {
      executor.registerTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      });

      expect(executor.hasTool('test_tool')).toBe(true);
      expect(executor.getToolCount()).toBe(1);
    });

    it('应该覆盖已存在的工具', () => {
      executor.registerTool({
        name: 'test_tool',
        description: 'Original',
        inputSchema: {},
        handler: async () => ({ content: [] }),
      });

      executor.registerTool({
        name: 'test_tool',
        description: 'Updated',
        inputSchema: {},
        handler: async () => ({ content: [] }),
      });

      const tool = executor.getTool('test_tool');
      expect(tool?.description).toBe('Updated');
    });
  });

  describe('validate', () => {
    it('应该验证成功当参数有效', () => {
      executor.registerTool({
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        handler: async () => ({ content: [] }),
      });

      const result = executor.validate('test', { name: 'test' });
      expect(result.valid).toBe(true);
    });

    it('应该验证失败当缺少必需字段', () => {
      executor.registerTool({
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        handler: async () => ({ content: [] }),
      });

      const result = executor.validate('test', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('应该验证失败当类型不匹配', () => {
      executor.registerTool({
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: { count: { type: 'number' } },
        },
        handler: async () => ({ content: [] }),
      });

      const result = executor.validate('test', { count: 'not-a-number' });
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('wrong type'))).toBe(true);
    });

    it('应该返回错误当工具不存在', () => {
      const result = executor.validate('not-exist', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool not found: not-exist');
    });
  });

  describe('execute', () => {
    it('应该成功执行工具', async () => {
      executor.registerTool({
        name: 'echo',
        description: 'Echo tool',
        inputSchema: {},
        handler: async (args) => ({
          content: [{ type: 'text', text: String((args as { message: string }).message) }],
        }),
      });

      const result = await executor.execute('echo', { message: 'Hello' });
      expect(result.content[0].text).toBe('Hello');
      expect(result.isError).toBeFalsy();
    });

    it('应该返回错误当工具不存在', async () => {
      const result = await executor.execute('not-exist', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool not found');
    });

    it('应该返回错误当验证失败', async () => {
      executor.registerTool({
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
        },
        handler: async () => ({ content: [] }),
      });

      const result = await executor.execute('test', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });
  });

  describe('setRateLimit', () => {
    it('应该设置速率限制', async () => {
      executor.registerTool({
        name: 'limited',
        description: 'Limited tool',
        inputSchema: {},
        handler: async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      });

      executor.setRateLimit('limited', { maxRequests: 1, windowMs: 1000 });

      // 第一次应该成功
      const result1 = await executor.execute('limited', {});
      expect(result1.isError).toBeFalsy();

      // 第二次应该被限流
      const result2 = await executor.execute('limited', {});
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Rate limit exceeded');
    });

    it('应该忽略不存在的工具', () => {
      executor.setRateLimit('not-exist', { maxRequests: 10, windowMs: 1000 });
      // 不应该抛出错误
    });
  });

  describe('setTimeout', () => {
    it('应该设置超时', async () => {
      executor.registerTool({
        name: 'slow',
        description: 'Slow tool',
        inputSchema: {},
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { content: [{ type: 'text', text: 'Done' }] };
        },
      });

      executor.setTimeout('slow', 100);

      const result = await executor.execute('slow', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('timeout');
    });
  });

  describe('listTools', () => {
    it('应该列出所有工具', () => {
      executor.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: {},
        handler: async () => ({ content: [] }),
      });

      executor.registerTool({
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: {},
        handler: async () => ({ content: [] }),
      });

      const tools = executor.listTools();
      expect(tools.length).toBe(2);
      expect(tools.map((t) => t.name)).toContain('tool1');
      expect(tools.map((t) => t.name)).toContain('tool2');
    });
  });

  describe('clear', () => {
    it('应该清空所有工具', () => {
      executor.registerTool({
        name: 'tool',
        description: 'Tool',
        inputSchema: {},
        handler: async () => ({ content: [] }),
      });

      executor.clear();
      expect(executor.getToolCount()).toBe(0);
    });
  });
});