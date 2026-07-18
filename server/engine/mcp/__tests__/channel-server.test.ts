/**
 * Channel Server 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpChannelServer, createMcpChannelServer } from '../channel-server.js';
import { McpChannelBridge } from '../channel-bridge.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('McpChannelServer', () => {
  let server: McpChannelServer;
  let bridge: McpChannelBridge;

  beforeEach(() => {
    bridge = new McpChannelBridge({
      source: 'server',
      target: 'client',
    });
    server = new McpChannelServer('test-server', bridge);
  });

  describe('constructor', () => {
    it('应该创建实例', () => {
      expect(server).toBeDefined();
    });

    it('初始状态应该是未初始化', () => {
      expect(server.isInitialized()).toBe(false);
    });
  });

  describe('createMcpChannelServer', () => {
    it('应该创建服务器实例', () => {
      const b = new McpChannelBridge({ source: 's', target: 't' });
      const s = createMcpChannelServer('test', b);
      expect(s).toBeInstanceOf(McpChannelServer);
    });
  });

  describe('tool registration', () => {
    it('应该成功注册工具', () => {
      server.registerTool(
        { name: 'test_tool', description: 'Test', inputSchema: {} },
        async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      );

      expect(server.getToolCount()).toBe(1);
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

    it('应该覆盖同名工具', () => {
      server.registerTool(
        { name: 'test', description: 'Original', inputSchema: {} },
        async () => ({ content: [] }),
      );

      server.registerTool(
        { name: 'test', description: 'Updated', inputSchema: {} },
        async () => ({ content: [] }),
      );

      expect(server.getToolCount()).toBe(1);
    });
  });

  describe('resource registration', () => {
    it('应该成功注册资源', () => {
      server.registerResource(
        { uri: 'test://resource', name: 'Test Resource' },
        async () => ({
          contents: [{ uri: 'test://resource', text: 'content' }],
        }),
      );

      expect(server.getResourceCount()).toBe(1);
    });

    it('应该支持多个资源', () => {
      server.registerResource(
        { uri: 'r1', name: 'R1' },
        async () => ({ contents: [] }),
      );
      server.registerResource(
        { uri: 'r2', name: 'R2' },
        async () => ({ contents: [] }),
      );

      expect(server.getResourceCount()).toBe(2);
    });
  });

  describe('prompt registration', () => {
    it('应该成功注册提示', () => {
      server.registerPrompt(
        { name: 'test_prompt', description: 'Test Prompt' },
        async () => ({
          messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        }),
      );

      expect(server.getPromptCount()).toBe(1);
    });

    it('应该支持多个提示', () => {
      server.registerPrompt(
        { name: 'p1', description: 'P1' },
        async () => ({ messages: [] }),
      );
      server.registerPrompt(
        { name: 'p2', description: 'P2' },
        async () => ({ messages: [] }),
      );

      expect(server.getPromptCount()).toBe(2);
    });
  });

  describe('unregister methods', () => {
    it('应该注销工具', () => {
      server.registerTool(
        { name: 'test', description: 'Test', inputSchema: {} },
        async () => ({ content: [] }),
      );

      server.unregisterTool('test');

      expect(server.getToolCount()).toBe(0);
    });

    it('应该注销资源', () => {
      server.registerResource(
        { uri: 'test://r', name: 'R' },
        async () => ({ contents: [] }),
      );

      server.unregisterResource('test://r');

      expect(server.getResourceCount()).toBe(0);
    });

    it('应该注销提示', () => {
      server.registerPrompt(
        { name: 'test', description: 'Test' },
        async () => ({ messages: [] }),
      );

      server.unregisterPrompt('test');

      expect(server.getPromptCount()).toBe(0);
    });
  });

  describe('capabilities', () => {
    it('应该设置功能', () => {
      server.setCapabilities({ tools: {} });
      // 不应该抛出错误
      expect(server).toBeDefined();
    });
  });

  describe('request timeout', () => {
    it('应该设置请求超时', () => {
      server.setRequestTimeout(10000);
      // 不应该抛出错误
      expect(server).toBeDefined();
    });
  });

  describe('log level', () => {
    it('应该返回日志级别', () => {
      const level = server.getLogLevel();
      expect(typeof level).toBe('string');
    });
  });

  describe('request handlers', () => {
    it('应该注册自定义请求处理程序', () => {
      server.registerRequestHandler('custom', async () => ({}));
      // 不应该抛出错误
      expect(server).toBeDefined();
    });

    it('应该注销请求处理程序', () => {
      server.registerRequestHandler('test', async () => ({}));
      server.unregisterRequestHandler('test');
      // 不应该抛出错误
      expect(server).toBeDefined();
    });
  });

  describe('client info', () => {
    it('初始客户端信息应该为 undefined', () => {
      expect(server.getClientInfo()).toBeUndefined();
    });
  });
});
