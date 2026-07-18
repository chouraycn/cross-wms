/**
 * ChannelToolsManager 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelToolsManager } from '../channel-tools.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ChannelToolsManager', () => {
  let manager: ChannelToolsManager;

  beforeEach(() => {
    manager = new ChannelToolsManager();
  });

  describe('registerTool', () => {
    it('应该成功注册通道工具', () => {
      manager.registerTool({
        tool: {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object' },
        },
        channel: 'test-channel',
      });

      expect(manager.hasTool('test_tool')).toBe(true);
      expect(manager.getToolCount()).toBe(1);
    });

    it('应该覆盖已存在的工具', () => {
      manager.registerTool({
        tool: { name: 'test', description: 'Original', inputSchema: {} },
        channel: 'ch1',
      });

      manager.registerTool({
        tool: { name: 'test', description: 'Updated', inputSchema: {} },
        channel: 'ch2',
      });

      expect(manager.getToolChannel('test')).toBe('ch2');
    });
  });

  describe('unregisterTool', () => {
    it('应该成功注销工具', () => {
      manager.registerTool({
        tool: { name: 'test', description: 'Test', inputSchema: {} },
        channel: 'ch',
      });

      manager.unregisterTool('test');

      expect(manager.hasTool('test')).toBe(false);
      expect(manager.getToolCount()).toBe(0);
    });

    it('应该忽略不存在的工具', () => {
      manager.unregisterTool('not-exist');
      // 不应该抛出错误
    });
  });

  describe('listTools', () => {
    it('应该列出所有工具', () => {
      manager.registerTool({
        tool: { name: 'tool1', description: 'Tool 1', inputSchema: {} },
        channel: 'ch',
      });
      manager.registerTool({
        tool: { name: 'tool2', description: 'Tool 2', inputSchema: {} },
        channel: 'ch',
      });

      const tools = manager.listTools();
      expect(tools.length).toBe(2);
    });
  });

  describe('listChannels', () => {
    it('应该列出所有通道', () => {
      manager.registerTool({
        tool: { name: 't1', description: 'T1', inputSchema: {} },
        channel: 'ch1',
      });
      manager.registerTool({
        tool: { name: 't2', description: 'T2', inputSchema: {} },
        channel: 'ch2',
      });

      const channels = manager.listChannels();
      expect(channels.length).toBe(2);
      expect(channels).toContain('ch1');
      expect(channels).toContain('ch2');
    });
  });

  describe('callTool', () => {
    it('应该成功调用工具', async () => {
      manager.registerTool({
        tool: { name: 'echo', description: 'Echo', inputSchema: {} },
        channel: 'test',
      });

      manager.registerCallHandler('test', async (_name, args) => ({
        content: [{ type: 'text', text: String(args.message) }],
      }));

      const result = await manager.callTool('echo', { message: 'Hello' });
      expect(result.content[0].text).toBe('Hello');
      expect(result.isError).toBeFalsy();
    });

    it('应该返回错误当工具不存在', async () => {
      const result = await manager.callTool('not-exist', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool not found');
    });

    it('应该返回错误当没有处理程序', async () => {
      manager.registerTool({
        tool: { name: 'orphan', description: 'Orphan', inputSchema: {} },
        channel: 'no-handler',
      });

      const result = await manager.callTool('orphan', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No handler');
    });
  });

  describe('validateToolArgs', () => {
    it('应该验证成功当参数有效', () => {
      manager.registerTool({
        tool: {
          name: 'test',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
        channel: 'ch',
      });

      const result = manager.validateToolArgs('test', { name: 'test' });
      expect(result.valid).toBe(true);
    });

    it('应该验证失败当缺少必需参数', () => {
      manager.registerTool({
        tool: {
          name: 'test',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
        channel: 'ch',
      });

      const result = manager.validateToolArgs('test', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required argument');
    });

    it('应该验证失败当类型不匹配', () => {
      manager.registerTool({
        tool: {
          name: 'test',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: { count: { type: 'number' } },
          },
        },
        channel: 'ch',
      });

      const result = manager.validateToolArgs('test', { count: 'not-number' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('wrong type');
    });
  });

  describe('getToolStats', () => {
    it('应该返回工具统计信息', async () => {
      manager.registerTool({
        tool: { name: 'test', description: 'Test', inputSchema: {} },
        channel: 'ch',
      });

      manager.registerCallHandler('ch', async () => ({
        content: [{ type: 'text', text: 'OK' }],
      }));

      await manager.callTool('test', {});
      await manager.callTool('test', {});

      const stats = manager.getToolStats('test');
      expect(stats?.calls).toBe(2);
      expect(stats?.errors).toBe(0);
    });

    it('应该返回 undefined 当工具不存在', () => {
      const stats = manager.getToolStats('not-exist');
      expect(stats).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('应该清空所有工具和处理程序', () => {
      manager.registerTool({
        tool: { name: 't1', description: 'T1', inputSchema: {} },
        channel: 'ch',
      });
      manager.registerCallHandler('ch', async () => ({ content: [] }));

      manager.clear();

      expect(manager.getToolCount()).toBe(0);
      expect(manager.listChannels().length).toBe(0);
    });
  });
});
