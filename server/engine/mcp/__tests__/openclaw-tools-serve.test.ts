/**
 * OpenClaw Tools Server 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenClawToolsServer, createOpenClawToolsServer } from '../openclaw-tools-serve.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OpenClawToolsServer', () => {
  let server: OpenClawToolsServer;

  beforeEach(() => {
    server = new OpenClawToolsServer({
      enableBuiltinTools: true,
    });
  });

  describe('constructor', () => {
    it('应该创建实例', () => {
      expect(server).toBeDefined();
    });

    it('初始状态应该是未运行', () => {
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('createOpenClawToolsServer', () => {
    it('应该创建服务器实例', () => {
      const s = createOpenClawToolsServer({});
      expect(s).toBeInstanceOf(OpenClawToolsServer);
    });
  });

  describe('builtin tools', () => {
    it('应该包含内置工具', () => {
      const tools = server.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('应该包含 list_sessions 工具', () => {
      const tools = server.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('list_sessions');
    });

    it('应该包含 send_reply 工具', () => {
      const tools = server.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('send_reply');
    });

    it('应该包含 read_history 工具', () => {
      const tools = server.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('read_history');
    });

    it('应该包含 wait_for_event 工具', () => {
      const tools = server.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('wait_for_event');
    });
  });

  describe('registerTool', () => {
    it('应该注册自定义工具', () => {
      const initialCount = server.getToolCount();

      server.registerTool({
        name: 'custom_tool',
        description: 'Custom',
        inputSchema: {},
        handler: async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      });

      expect(server.getToolCount()).toBe(initialCount + 1);
    });
  });

  describe('unregisterTool', () => {
    it('应该注销工具', () => {
      server.registerTool({
        name: 'temp_tool',
        description: 'Temp',
        inputSchema: {},
        handler: async () => ({ content: [] }),
      });

      const countBefore = server.getToolCount();
      server.unregisterTool('temp_tool');

      expect(server.getToolCount()).toBe(countBefore - 1);
    });
  });

  describe('callTool', () => {
    it('应该成功调用内置工具 list_sessions', async () => {
      const result = await server.callTool('list_sessions', {});
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('应该成功调用内置工具 send_reply', async () => {
      const result = await server.callTool('send_reply', {
        sessionKey: 'test-session',
        text: 'Hello',
      });
      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
    });

    it('应该成功调用内置工具 read_history', async () => {
      const result = await server.callTool('read_history', {
        sessionKey: 'test-session',
      });
      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
    });

    it('应该返回错误当工具不存在', async () => {
      const result = await server.callTool('not-exist', {});
      expect(result.isError).toBe(true);
    });
  });

  describe('getToolCount', () => {
    it('应该返回工具数量', () => {
      const count = server.getToolCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('listTools', () => {
    it('应该返回工具列表', () => {
      const tools = server.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('工具应该有 name 属性', () => {
      const tools = server.listTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
      }
    });

    it('工具应该有 description 属性', () => {
      const tools = server.listTools();
      for (const tool of tools) {
        expect(tool.description).toBeDefined();
      }
    });
  });

  describe('getToolExecutor', () => {
    it('应该返回工具执行器', () => {
      const executor = server.getToolExecutor();
      expect(executor).toBeDefined();
    });
  });

  describe('disable builtin tools', () => {
    it('应该支持禁用内置工具', () => {
      const s = new OpenClawToolsServer({
        enableBuiltinTools: false,
      });
      expect(s.getToolCount()).toBe(0);
    });
  });
});
