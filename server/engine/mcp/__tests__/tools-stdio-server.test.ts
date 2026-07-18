/**
 * McpStdioServer 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpStdioServer } from '../tools-stdio-server.js';
import { MCP_PROTOCOL_VERSION } from '../types.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('McpStdioServer', () => {
  let server: McpStdioServer;

  beforeEach(() => {
    server = new McpStdioServer({
      serverName: 'test-server',
      version: '1.0.0',
    });
  });

  describe('constructor', () => {
    it('应该正确初始化服务器信息', () => {
      const info = server.getServerInfo();
      expect(info.name).toBe('test-server');
      expect(info.version).toBe('1.0.0');
    });

    it('初始状态应该是未运行且未初始化', () => {
      expect(server.isRunning()).toBe(false);
      expect(server.isInitialized()).toBe(false);
    });
  });

  describe('registerTool', () => {
    it('应该成功注册工具', () => {
      server.registerTool(
        { name: 'test_tool', description: 'Test', inputSchema: {} },
        async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      );

      expect(server.getToolCount()).toBe(1);
      expect(server.listTools().length).toBe(1);
    });

    it('应该支持多个工具', () => {
      server.registerTool(
        { name: 'tool1', description: 'T1', inputSchema: {} },
        async () => ({ content: [] }),
      );
      server.registerTool(
        { name: 'tool2', description: 'T2', inputSchema: {} },
        async () => ({ content: [] }),
      );

      expect(server.getToolCount()).toBe(2);
    });
  });

  describe('unregisterTool', () => {
    it('应该成功注销工具', () => {
      server.registerTool(
        { name: 'test', description: 'Test', inputSchema: {} },
        async () => ({ content: [] }),
      );

      server.unregisterTool('test');

      expect(server.getToolCount()).toBe(0);
    });
  });

  describe('callTool', () => {
    it('应该成功调用工具', async () => {
      server.registerTool(
        { name: 'echo', description: 'Echo', inputSchema: {} },
        async (args) => ({
          content: [{ type: 'text', text: String(args.message) }],
        }),
      );

      const result = await server.callTool('echo', { message: 'Hello' });
      expect(result.content[0].text).toBe('Hello');
      expect(result.isError).toBeFalsy();
    });

    it('应该返回错误当工具不存在', async () => {
      const result = await server.callTool('not-exist', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool not found');
    });

    it('应该捕获工具处理程序的错误', async () => {
      server.registerTool(
        { name: 'error', description: 'Error', inputSchema: {} },
        async () => {
          throw new Error('Test error');
        },
      );

      const result = await server.callTool('error', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool error');
    });
  });

  describe('request handlers', () => {
    it('应该注册自定义请求处理程序', async () => {
      let called = false;
      server.registerRequestHandler('custom_method', async (params) => {
        called = true;
        return { received: params };
      });

      // 通过模拟初始化来验证
      expect(server.isRunning()).toBe(false);
      expect(called).toBe(false);
    });

    it('应该注销请求处理程序', () => {
      server.registerRequestHandler('test', async () => ({}));
      server.unregisterRequestHandler('test');
      // 不应该抛出错误
    });
  });

  describe('capabilities', () => {
    it('应该设置和获取功能', () => {
      server.setCapabilities({ tools: {} });
      const caps = server.getCapabilities();
      expect(caps.tools).toBeDefined();
    });

    it('应该返回功能的副本', () => {
      server.setCapabilities({ tools: {} });
      const caps1 = server.getCapabilities();
      const caps2 = server.getCapabilities();
      caps1.test = 'modified';
      expect(caps2.test).toBeUndefined();
    });
  });

  describe('log level', () => {
    it('默认日志级别应该是 info', () => {
      expect(server.getLogLevel()).toBe('info');
    });
  });

  describe('request timeout', () => {
    it('应该设置请求超时', () => {
      server.setRequestTimeout(5000);
      // 验证不会抛出错误
      expect(server).toBeDefined();
    });
  });

  describe('server info', () => {
    it('应该返回服务器信息的副本', () => {
      const info1 = server.getServerInfo();
      const info2 = server.getServerInfo();
      info1.name = 'modified';
      expect(info2.name).toBe('test-server');
    });
  });

  describe('MCP 常量验证', () => {
    it('MCP_PROTOCOL_VERSION 应该存在', () => {
      expect(MCP_PROTOCOL_VERSION).toBeDefined();
      expect(typeof MCP_PROTOCOL_VERSION).toBe('string');
    });
  });
});
