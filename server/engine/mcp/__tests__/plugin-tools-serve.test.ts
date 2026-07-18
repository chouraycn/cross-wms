/**
 * PluginToolsServe 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginToolsServe } from '../plugin-tools-serve.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PluginToolsServe', () => {
  let serve: PluginToolsServe;

  beforeEach(() => {
    serve = new PluginToolsServe();
  });

  describe('registerPlugin', () => {
    it('应该成功注册插件', () => {
      serve.registerPlugin({
        id: 'plugin-1',
        name: 'Plugin 1',
        tools: [
          { name: 'tool1', description: 'Tool 1', handler: async () => ({ content: [] }) },
        ],
      });

      expect(serve.hasPlugin('plugin-1')).toBe(true);
      expect(serve.getPluginCount()).toBe(1);
    });

    it('应该注册插件的工具', () => {
      serve.registerPlugin({
        id: 'p1',
        tools: [
          { name: 't1', description: 'T1', handler: async () => ({ content: [] }) },
          { name: 't2', description: 'T2', handler: async () => ({ content: [] }) },
        ],
      });

      expect(serve.getToolCount()).toBe(2);
    });
  });

  describe('unregisterPlugin', () => {
    it('应该成功注销插件', () => {
      serve.registerPlugin({
        id: 'p1',
        tools: [{ name: 't1', description: 'T1', handler: async () => ({ content: [] }) }],
      });

      const result = serve.unregisterPlugin('p1');

      expect(result).toBe(true);
      expect(serve.hasPlugin('p1')).toBe(false);
      expect(serve.getToolCount()).toBe(0);
    });

    it('应该返回 false 当插件不存在', () => {
      const result = serve.unregisterPlugin('not-exist');
      expect(result).toBe(false);
    });
  });

  describe('enable/disable plugin', () => {
    it('应该禁用插件', () => {
      serve.registerPlugin({
        id: 'p1',
        tools: [{ name: 't1', description: 'T1', handler: async () => ({ content: [] }) }],
      });

      serve.disablePlugin('p1');

      expect(serve.isPluginEnabled('p1')).toBe(false);
      expect(serve.getToolCount()).toBe(0);
    });

    it('应该启用插件', () => {
      serve.registerPlugin({
        id: 'p1',
        enabled: false,
        tools: [{ name: 't1', description: 'T1', handler: async () => ({ content: [] }) }],
      });

      expect(serve.isPluginEnabled('p1')).toBe(false);

      serve.enablePlugin('p1');

      expect(serve.isPluginEnabled('p1')).toBe(true);
      expect(serve.getToolCount()).toBe(1);
    });
  });

  describe('registerTool/unregisterTool', () => {
    it('应该为插件注册工具', () => {
      serve.registerPlugin({ id: 'p1' });

      const result = serve.registerTool(
        'p1',
        { name: 'new_tool', description: 'New Tool' },
        async () => ({ content: [] }),
      );

      expect(result).toBe(true);
      expect(serve.getToolCount()).toBe(1);
    });

    it('应该返回 false 当插件不存在', () => {
      const result = serve.registerTool(
        'no-plugin',
        { name: 't', description: 'T' },
        async () => ({ content: [] }),
      );

      expect(result).toBe(false);
    });

    it('应该注销插件工具', () => {
      serve.registerPlugin({
        id: 'p1',
        tools: [{ name: 't1', description: 'T1', handler: async () => ({ content: [] }) }],
      });

      const result = serve.unregisterTool('p1', 't1');

      expect(result).toBe(true);
      expect(serve.getToolCount()).toBe(0);
    });
  });

  describe('listPlugins', () => {
    it('应该列出所有插件', () => {
      serve.registerPlugin({ id: 'p1', name: 'Plugin 1' });
      serve.registerPlugin({ id: 'p2', name: 'Plugin 2' });

      const plugins = serve.listPlugins();
      expect(plugins.length).toBe(2);
    });
  });

  describe('callTool', () => {
    it('应该成功调用工具', async () => {
      serve.registerPlugin({
        id: 'p1',
        tools: [
          {
            name: 'echo',
            description: 'Echo',
            handler: async (ctx) => ({
              content: [{ type: 'text', text: String(ctx.args.message) }],
            }),
          },
        ],
      });

      const result = await serve.callTool('echo', { message: 'Hello' });
      expect(result.content[0].text).toBe('Hello');
      expect(result.isError).toBeFalsy();
    });
  });

  describe('getPluginInfo', () => {
    it('应该返回插件信息', () => {
      serve.registerPlugin({
        id: 'p1',
        name: 'My Plugin',
        tools: [
          { name: 't1', description: 'T1', handler: async () => ({ content: [] }) },
        ],
      });

      const info = serve.getPluginInfo('p1');
      expect(info).toBeDefined();
      expect(info?.name).toBe('My Plugin');
      expect(info?.toolCount).toBe(1);
      expect(info?.enabled).toBe(true);
    });

    it('应该返回 undefined 当插件不存在', () => {
      const info = serve.getPluginInfo('not-exist');
      expect(info).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('应该清空所有插件和工具', () => {
      serve.registerPlugin({
        id: 'p1',
        tools: [{ name: 't1', description: 'T1', handler: async () => ({ content: [] }) }],
      });

      serve.clear();

      expect(serve.getPluginCount()).toBe(0);
      expect(serve.getToolCount()).toBe(0);
    });
  });
});
