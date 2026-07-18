/**
 * PluginToolHandlers 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginToolHandlers } from '../plugin-tools-handlers.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PluginToolHandlers', () => {
  let handlers: PluginToolHandlers;

  beforeEach(() => {
    handlers = new PluginToolHandlers();
  });

  describe('registerTool', () => {
    it('应该成功注册工具处理器', () => {
      handlers.registerTool(
        { name: 'test_tool', description: 'Test' },
        async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      );

      expect(handlers.hasTool('test_tool')).toBe(true);
      expect(handlers.getToolCount()).toBe(1);
    });

    it('应该支持插件 ID 关联', () => {
      handlers.registerTool(
        { name: 'test', description: 'Test' },
        async () => ({ content: [] }),
        { pluginId: 'plugin-a' },
      );

      const tools = handlers.getToolsByPlugin('plugin-a');
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('test');
    });
  });

  describe('unregisterTool', () => {
    it('应该成功注销工具', () => {
      handlers.registerTool(
        { name: 'test', description: 'Test' },
        async () => ({ content: [] }),
      );

      handlers.unregisterTool('test');

      expect(handlers.hasTool('test')).toBe(false);
    });
  });

  describe('executeTool', () => {
    it('应该成功执行工具', async () => {
      handlers.registerTool(
        { name: 'echo', description: 'Echo' },
        async (ctx) => ({
          content: [{ type: 'text', text: String(ctx.args.message) }],
        }),
      );

      const result = await handlers.executeTool('echo', { message: 'Hello' });
      expect(result.content[0].text).toBe('Hello');
      expect(result.isError).toBeFalsy();
    });

    it('应该返回错误当工具不存在', async () => {
      const result = await handlers.executeTool('not-exist', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool not found');
    });

    it('应该正确传递上下文', async () => {
      let capturedCtx: unknown = null;
      handlers.registerTool(
        { name: 'ctx_test', description: 'Test' },
        async (ctx) => {
          capturedCtx = ctx;
          return { content: [] };
        },
      );

      await handlers.executeTool('ctx_test', {}, { sessionId: 's1', requestId: 'r1' });

      const ctx = capturedCtx as { sessionId?: string; requestId?: string | number };
      expect(ctx.sessionId).toBe('s1');
      expect(ctx.requestId).toBe('r1');
    });
  });

  describe('中间件', () => {
    it('应该执行全局中间件', async () => {
      const middlewareCalls: string[] = [];

      handlers.addGlobalMiddleware(async (ctx, next) => {
        middlewareCalls.push('before');
        const result = await next();
        middlewareCalls.push('after');
        return result;
      });

      handlers.registerTool(
        { name: 'test', description: 'Test' },
        async () => {
          middlewareCalls.push('handler');
          return { content: [{ type: 'text', text: 'OK' }] };
        },
      );

      await handlers.executeTool('test', {});

      expect(middlewareCalls).toEqual(['before', 'handler', 'after']);
    });

    it('应该执行工具特定中间件', async () => {
      const middlewareCalls: string[] = [];

      handlers.addToolMiddleware('test', async (ctx, next) => {
        middlewareCalls.push('tool-before');
        const result = await next();
        middlewareCalls.push('tool-after');
        return result;
      });

      handlers.registerTool(
        { name: 'test', description: 'Test' },
        async () => {
          middlewareCalls.push('handler');
          return { content: [] };
        },
      );

      await handlers.executeTool('test', {});

      expect(middlewareCalls).toEqual(['tool-before', 'handler', 'tool-after']);
    });

    it('中间件可以修改结果', async () => {
      handlers.addGlobalMiddleware(async (_ctx, next) => {
        const result = await next();
        return {
          ...result,
          metadata: { modified: true },
        };
      });

      handlers.registerTool(
        { name: 'test', description: 'Test' },
        async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      );

      const result = await handlers.executeTool('test', {});
      expect(result.metadata?.modified).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该捕获处理程序错误', async () => {
      handlers.registerTool(
        { name: 'error_tool', description: 'Error' },
        async () => {
          throw new Error('Something went wrong');
        },
      );

      const result = await handlers.executeTool('error_tool', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool error');
    });

    it('应该调用错误处理程序', async () => {
      let errorHandled = false;
      handlers.setErrorHandler(async (err, _ctx) => {
        errorHandled = true;
        return {
          content: [{ type: 'text', text: `Handled: ${err.message}` }],
          isError: true,
        };
      });

      handlers.registerTool(
        { name: 'error', description: 'Error' },
        async () => {
          throw new Error('Test error');
        },
      );

      const result = await handlers.executeTool('error', {});
      expect(errorHandled).toBe(true);
      expect(result.content[0].text).toContain('Handled: Test error');
    });
  });

  describe('Fallback Handlers', () => {
    it('应该使用回退处理程序', async () => {
      handlers.registerFallbackHandler(
        'dynamic_',
        async (ctx) => ({
          content: [{ type: 'text', text: `Dynamic: ${ctx.toolName}` }],
        }),
      );

      const result = await handlers.executeTool('dynamic_test', {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Dynamic: dynamic_test');
    });

    it('应该支持正则表达式模式', async () => {
      handlers.registerFallbackHandler(
        /^regex_/,
        async (ctx) => ({
          content: [{ type: 'text', text: `Regex: ${ctx.toolName}` }],
        }),
      );

      const result = await handlers.executeTool('regex_match', {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Regex: regex_match');
    });
  });

  describe('速率限制', () => {
    it('应该强制执行速率限制', async () => {
      handlers.registerTool(
        {
          name: 'limited',
          description: 'Limited',
          rateLimit: { maxRequests: 2, windowMs: 10000 },
        },
        async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      );

      const r1 = await handlers.executeTool('limited', {});
      expect(r1.isError).toBeFalsy();

      const r2 = await handlers.executeTool('limited', {});
      expect(r2.isError).toBeFalsy();

      const r3 = await handlers.executeTool('limited', {});
      expect(r3.isError).toBe(true);
      expect(r3.content[0].text).toContain('Rate limit exceeded');
    });
  });

  describe('插件工具管理', () => {
    it('应该按插件获取工具', () => {
      handlers.registerTool(
        { name: 't1', description: 'T1' },
        async () => ({ content: [] }),
        { pluginId: 'p1' },
      );
      handlers.registerTool(
        { name: 't2', description: 'T2' },
        async () => ({ content: [] }),
        { pluginId: 'p1' },
      );
      handlers.registerTool(
        { name: 't3', description: 'T3' },
        async () => ({ content: [] }),
        { pluginId: 'p2' },
      );

      const p1Tools = handlers.getToolsByPlugin('p1');
      const p2Tools = handlers.getToolsByPlugin('p2');

      expect(p1Tools.length).toBe(2);
      expect(p2Tools.length).toBe(1);
    });

    it('应该注销插件的所有工具', () => {
      handlers.registerTool(
        { name: 't1', description: 'T1' },
        async () => ({ content: [] }),
        { pluginId: 'p1' },
      );
      handlers.registerTool(
        { name: 't2', description: 'T2' },
        async () => ({ content: [] }),
        { pluginId: 'p1' },
      );

      const count = handlers.unregisterPluginTools('p1');
      expect(count).toBe(2);
      expect(handlers.getToolCount()).toBe(0);
    });
  });

  describe('validateArgs', () => {
    it('应该验证参数', () => {
      handlers.registerTool(
        {
          name: 'test',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: { count: { type: 'number' } },
            required: ['count'],
          },
        },
        async () => ({ content: [] }),
      );

      const validResult = handlers.validateArgs('test', { count: 42 });
      expect(validResult.valid).toBe(true);

      const invalidResult = handlers.validateArgs('test', {});
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('Missing required argument');
    });
  });
});
