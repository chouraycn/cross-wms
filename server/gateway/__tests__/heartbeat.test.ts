import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatManager, createHeartbeatManager, resolveHeartbeatConfig } from '../heartbeat.js';

function createMockSocket() {
  return {
    ping: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    removeAllListeners: vi.fn(),
  };
}

describe('Heartbeat 模块单元测试', () => {
  describe('配置解析', () => {
    it('应该返回默认配置', () => {
      const config = resolveHeartbeatConfig();

      expect(config.pingIntervalMs).toBe(25000);
      expect(config.pongTimeoutMs).toBe(5000);
      expect(config.maxMissedPongs).toBe(3);
      expect(config.autoStart).toBe(false);
    });

    it('应该合并自定义配置', () => {
      const config = resolveHeartbeatConfig({
        pingIntervalMs: 10000,
        pongTimeoutMs: 3000,
      });

      expect(config.pingIntervalMs).toBe(10000);
      expect(config.pongTimeoutMs).toBe(3000);
      expect(config.maxMissedPongs).toBe(3);
    });
  });

  describe('心跳管理器创建', () => {
    it('应该能够创建心跳管理器', () => {
      const manager = createHeartbeatManager('test-client');

      expect(manager).toBeInstanceOf(HeartbeatManager);
      expect(manager.getState().isRunning).toBe(false);
    });

    it('应该能够使用自定义配置创建', () => {
      const manager = createHeartbeatManager('test-client', {
        pingIntervalMs: 1000,
        pongTimeoutMs: 500,
      });

      expect(manager).toBeInstanceOf(HeartbeatManager);
    });
  });

  describe('心跳状态管理', () => {
    it('初始状态应该正确', () => {
      const manager = createHeartbeatManager('test-client');

      const state = manager.getState();
      expect(state.isRunning).toBe(false);
      expect(state.consecutiveMissedPongs).toBe(0);
      expect(state.totalPings).toBe(0);
      expect(state.totalPongs).toBe(0);
    });

    it('应该能够附加和分离 socket', () => {
      const manager = createHeartbeatManager('test-client');
      const socket = createMockSocket();

      manager.attach(socket);
      manager.detach();

      expect(() => manager.start()).toThrow('Socket not attached');
    });

    it('应该能够检查连接健康状态', () => {
      const manager = createHeartbeatManager('test-client');
      const socket = createMockSocket();

      manager.attach(socket);

      expect(manager.isHealthy()).toBe(false);

      vi.useFakeTimers();
      manager.start();
      expect(manager.isHealthy()).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('事件处理', () => {
    it('应该触发 onPing 事件', () => {
      const onPing = vi.fn();
      const manager = createHeartbeatManager('test-client', { pingIntervalMs: 100 }, { onPing });
      const socket = createMockSocket();

      manager.attach(socket);

      vi.useFakeTimers();
      manager.start();
      vi.advanceTimersByTime(100);

      expect(onPing).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('应该触发 onPong 事件', () => {
      const onPong = vi.fn();
      const manager = createHeartbeatManager('test-client', { pingIntervalMs: 100 }, { onPong });
      const socket = createMockSocket();

      manager.attach(socket);

      vi.useFakeTimers();
      manager.start();
      vi.advanceTimersByTime(100);
      manager.handlePong();

      expect(onPong).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('应该触发 onStop 事件', () => {
      const onStop = vi.fn();
      const manager = createHeartbeatManager('test-client', {}, { onStop });
      const socket = createMockSocket();

      manager.attach(socket);
      manager.start();
      manager.stop('test');

      expect(onStop).toHaveBeenCalledWith({ clientId: 'test-client', reason: 'test' });
    });
  });

  describe('超时处理', () => {
    it('应该在连续丢失 pong 后触发超时', () => {
      const onTimeout = vi.fn();
      const manager = createHeartbeatManager('test-client', {
        pingIntervalMs: 100,
        pongTimeoutMs: 50,
        maxMissedPongs: 2,
      }, { onTimeout });
      const socket = createMockSocket();

      manager.attach(socket);

      vi.useFakeTimers();
      manager.start();

      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(50);

      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(50);

      expect(onTimeout).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});