/**
 * Channel Bridge 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpChannelBridge, createMcpChannelBridge } from '../channel-bridge.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('McpChannelBridge', () => {
  let bridge: McpChannelBridge;

  beforeEach(() => {
    bridge = new McpChannelBridge({
      source: 'test-source',
      target: 'test-target',
      mode: 'transparent',
    });
  });

  describe('constructor', () => {
    it('应该创建实例', () => {
      expect(bridge).toBeDefined();
    });

    it('初始统计信息应该为零', () => {
      const stats = bridge.getStats();
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
      expect(stats.bytesSent).toBe(0);
      expect(stats.bytesReceived).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('createMcpChannelBridge', () => {
    it('应该创建桥接实例', () => {
      const instance = createMcpChannelBridge({
        source: 'src',
        target: 'tgt',
      });
      expect(instance).toBeInstanceOf(McpChannelBridge);
    });
  });

  describe('handlers', () => {
    it('应该注册处理程序', () => {
      const handler = vi.fn();
      bridge.addHandler(handler);
      expect(bridge.getHandlerCount()).toBe(1);
    });

    it('应该支持多个处理程序', () => {
      bridge.addHandler(() => {});
      bridge.addHandler(() => {});
      expect(bridge.getHandlerCount()).toBe(2);
    });

    it('应该移除处理程序', () => {
      const handler = vi.fn();
      bridge.addHandler(handler);
      bridge.removeHandler(handler);
      expect(bridge.getHandlerCount()).toBe(0);
    });

    it('应该清空所有处理程序', () => {
      bridge.addHandler(() => {});
      bridge.addHandler(() => {});
      bridge.clearHandlers();
      expect(bridge.getHandlerCount()).toBe(0);
    });
  });

  describe('stats', () => {
    it('应该返回统计信息', () => {
      const stats = bridge.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.messagesSent).toBe('number');
    });

    it('应该重置统计信息', () => {
      bridge.resetStats();
      const stats = bridge.getStats();
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
    });
  });

  describe('buffer', () => {
    it('缓冲模式下应该返回缓冲区大小', () => {
      const bufferedBridge = new McpChannelBridge({
        source: 'src',
        target: 'tgt',
        mode: 'buffered',
      });
      expect(bufferedBridge.getBufferSize()).toBe(0);
    });

    it('透明模式下缓冲区大小应该为 0', () => {
      expect(bridge.getBufferSize()).toBe(0);
    });
  });

  describe('sendMessage', () => {
    it('应该能够发送消息', async () => {
      const result = await bridge.sendMessage({
        type: 'request',
        content: 'test',
      });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('flushBuffer', () => {
    it('应该能够刷新缓冲区', async () => {
      const bufferedBridge = new McpChannelBridge({
        source: 'src',
        target: 'tgt',
        mode: 'buffered',
      });
      await bufferedBridge.flushBuffer();
      expect(bufferedBridge.getBufferSize()).toBe(0);
    });
  });

  describe('modes', () => {
    it('应该支持 transparent 模式', () => {
      const b = new McpChannelBridge({
        source: 'src',
        target: 'tgt',
        mode: 'transparent',
      });
      expect(b).toBeDefined();
    });

    it('应该支持 buffered 模式', () => {
      const b = new McpChannelBridge({
        source: 'src',
        target: 'tgt',
        mode: 'buffered',
      });
      expect(b).toBeDefined();
    });

    it('应该支持 adaptive 模式', () => {
      const b = new McpChannelBridge({
        source: 'src',
        target: 'tgt',
        mode: 'adaptive',
      });
      expect(b).toBeDefined();
    });
  });
});
