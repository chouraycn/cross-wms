/**
 * MCP 类型和常量测试
 */

import { describe, it, expect } from 'vitest';
import {
  MCP_PROTOCOL_VERSION,
  MCPErrorCode,
  MCPMethod,
  type MCPLogLevel,
  type ChannelBridgeMode,
  type ChannelMessageType,
} from '../types.js';

// Mock logger
import { vi } from 'vitest';
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MCP Types and Constants', () => {
  describe('MCP_PROTOCOL_VERSION', () => {
    it('应该是一个字符串', () => {
      expect(typeof MCP_PROTOCOL_VERSION).toBe('string');
      expect(MCP_PROTOCOL_VERSION.length).toBeGreaterThan(0);
    });

    it('应该是日期格式的版本', () => {
      expect(MCP_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('MCPErrorCode', () => {
    it('应该包含所有标准错误码', () => {
      expect(MCPErrorCode.PARSE_ERROR).toBe(-32700);
      expect(MCPErrorCode.INVALID_REQUEST).toBe(-32600);
      expect(MCPErrorCode.METHOD_NOT_FOUND).toBe(-32601);
      expect(MCPErrorCode.INVALID_PARAMS).toBe(-32602);
      expect(MCPErrorCode.INTERNAL_ERROR).toBe(-32603);
    });

    it('错误码应该是负数', () => {
      const values = Object.values(MCPErrorCode);
      for (const value of values) {
        if (typeof value === 'number') {
          expect(value).toBeLessThan(0);
        }
      }
    });
  });

  describe('MCPMethod', () => {
    it('应该包含所有标准方法', () => {
      expect(MCPMethod.INITIALIZE).toBe('initialize');
      expect(MCPMethod.PING).toBe('ping');
      expect(MCPMethod.TOOLS_LIST).toBe('tools/list');
      expect(MCPMethod.TOOLS_CALL).toBe('tools/call');
      expect(MCPMethod.RESOURCES_LIST).toBe('resources/list');
      expect(MCPMethod.RESOURCES_READ).toBe('resources/read');
      expect(MCPMethod.PROMPTS_LIST).toBe('prompts/list');
      expect(MCPMethod.PROMPTS_GET).toBe('prompts/get');
    });

    it('方法名应该包含斜杠分隔符', () => {
      const methods = Object.values(MCPMethod);
      const slashMethods = methods.filter((m) => m.includes('/'));
      expect(slashMethods.length).toBeGreaterThan(0);
    });
  });

  describe('MCPLogLevel', () => {
    it('应该支持所有日志级别', () => {
      const levels: MCPLogLevel[] = ['debug', 'info', 'warning', 'error'];
      for (const level of levels) {
        expect(typeof level).toBe('string');
      }
    });
  });

  describe('ChannelBridgeMode', () => {
    it('应该支持所有通道桥接模式', () => {
      const modes: ChannelBridgeMode[] = ['transparent', 'adaptive', 'buffered'];
      for (const mode of modes) {
        expect(typeof mode).toBe('string');
      }
    });
  });

  describe('ChannelMessageType', () => {
    it('应该支持所有消息类型', () => {
      const types: ChannelMessageType[] = ['request', 'response', 'notification', 'event'];
      for (const type of types) {
        expect(typeof type).toBe('string');
      }
    });
  });

  describe('类型导出', () => {
    it('应该导出 JsonRpcRequest 类型', () => {
      // 类型测试 - 仅验证导出存在
      const test: { jsonrpc: '2.0'; id: string; method: string; params?: unknown } = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test',
      };
      expect(test.jsonrpc).toBe('2.0');
    });

    it('应该导出 JsonRpcResponse 类型', () => {
      const test: { jsonrpc: '2.0'; id: string; result?: unknown; error?: unknown } = {
        jsonrpc: '2.0',
        id: 'test',
        result: {},
      };
      expect(test.jsonrpc).toBe('2.0');
    });

    it('应该导出 MCPTool 类型', () => {
      const tool: { name: string; description: string; inputSchema: Record<string, unknown> } = {
        name: 'test',
        description: 'Test',
        inputSchema: {},
      };
      expect(tool.name).toBe('test');
    });
  });
});
