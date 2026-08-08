/**
 * 通道熔断器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChannelCircuitBreaker,
  ChannelCircuitBreakerManager,
  DEFAULT_CHANNEL_CIRCUIT_BREAKER_OPTIONS,
  ChannelCircuitOpenError,
  channelCircuitBreakerManager,
} from '../channel-circuit-breaker.js';
import type { ChannelHealthSnapshot } from '../channel-health-monitor.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeSnapshot(
  channelId: string,
  status: ChannelHealthSnapshot['status'],
  overrides?: Partial<ChannelHealthSnapshot>,
): ChannelHealthSnapshot {
  return {
    channelId,
    status,
    lastHeartbeatAt: Date.now(),
    lastDeliveryAt: Date.now(),
    windowMs: 300_000,
    totalDeliveries: 10,
    successfulDeliveries: 8,
    failedDeliveries: 2,
    retries: 1,
    deadLetters: 0,
    avgLatencyMs: 100,
    p50LatencyMs: 100,
    p95LatencyMs: 200,
    p99LatencyMs: 300,
    successRate: 0.8,
    queueDepth: 0,
    consecutiveFailures: 2,
    ...overrides,
  };
}

describe('ChannelCircuitBreaker', () => {
  let breaker: ChannelCircuitBreaker;

  beforeEach(() => {
    breaker = new ChannelCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
      halfOpenSuccessThreshold: 2,
      triggerStatuses: ['unhealthy'],
    });
  });

  describe('初始状态', () => {
    it('应为 closed', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('应允许投递', () => {
      expect(breaker.canDeliver()).toBe(true);
    });
  });

  describe('基于健康状态同步', () => {
    it('unhealthy 健康状态应触发熔断', () => {
      const snap = makeSnapshot('ch1', 'unhealthy');
      breaker.syncWithHealth(snap);
      expect(breaker.getState()).toBe('open');
      expect(breaker.snapshot().lastStatus).toBe('unhealthy');
    });

    it('degraded 健康状态不应触发熔断（未在 triggerStatuses 中）', () => {
      const snap = makeSnapshot('ch1', 'degraded');
      breaker.syncWithHealth(snap);
      expect(breaker.getState()).toBe('closed');
    });

    it('healthy 健康状态应从 half-open 转为 closed', () => {
      const snap1 = makeSnapshot('ch1', 'unhealthy');
      breaker.syncWithHealth(snap1);
      expect(breaker.getState()).toBe('open');

      // 模拟 cooldown 已过，进入 half-open
      breaker.canDeliver(Date.now() + 1001);
      expect(breaker.getState()).toBe('half-open');

      const snap2 = makeSnapshot('ch1', 'healthy');
      breaker.syncWithHealth(snap2);
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('基于失败计数', () => {
    it('连续失败达到阈值应打开熔断', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
    });

    it('成功应清零失败计数', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      expect(breaker.snapshot().consecutiveFailures).toBe(0);
    });
  });

  describe('cooldown', () => {
    it('open 状态下经过 cooldownMs 应进入 half-open', () => {
      const now = Date.now();
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      expect(breaker.getState()).toBe('open');

      expect(breaker.canDeliver(now + 500)).toBe(false);
      expect(breaker.canDeliver(now + 1001)).toBe(true);
      expect(breaker.getState()).toBe('half-open');
    });
  });

  describe('half-open 行为', () => {
    it('half-open 失败应立即重新打开', () => {
      const now = Date.now();
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      breaker.recordFailure(now);

      breaker.canDeliver(now + 1001);
      expect(breaker.getState()).toBe('half-open');

      breaker.recordFailure(now + 1100);
      expect(breaker.getState()).toBe('open');
    });

    it('half-open 连续成功达到阈值应关闭', () => {
      const now = Date.now();
      breaker.recordFailure(now);
      breaker.recordFailure(now);
      breaker.recordFailure(now);

      breaker.canDeliver(now + 1001);
      breaker.recordSuccess();
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('reset', () => {
    it('应重置到 closed 状态', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');

      breaker.reset();
      expect(breaker.getState()).toBe('closed');
    });
  });
});

describe('ChannelCircuitOpenError', () => {
  it('应包含 channelId 和 reopenAt', () => {
    const err = new ChannelCircuitOpenError('feishu', 12345);
    expect(err.channelId).toBe('feishu');
    expect(err.reopenAt).toBe(12345);
    expect(err.message).toContain('feishu');
    expect(err.name).toBe('ChannelCircuitOpenError');
  });
});

describe('ChannelCircuitBreakerManager', () => {
  let manager: ChannelCircuitBreakerManager;

  beforeEach(() => {
    manager = new ChannelCircuitBreakerManager({
      failureThreshold: 2,
      cooldownMs: 500,
      halfOpenSuccessThreshold: 1,
      triggerStatuses: ['unhealthy'],
    });
  });

  describe('注册与查询', () => {
    it('registerChannel 应创建通道熔断器', () => {
      manager.registerChannel('ch1');
      expect(manager.getCircuitBreaker('ch1')).toBeDefined();
    });

    it('unregisterChannel 应移除熔断器', () => {
      manager.registerChannel('ch1');
      manager.unregisterChannel('ch1');
      expect(manager.getCircuitBreaker('ch1')).toBeUndefined();
    });

    it('canDeliver 未注册通道应返回 true', () => {
      expect(manager.canDeliver('unknown')).toBe(true);
    });
  });

  describe('投递结果记录', () => {
    it('成功投递应记录 success', () => {
      manager.registerChannel('ch1');
      manager.recordDelivery('ch1', true);
      expect(manager.getCircuitBreaker('ch1')?.getConsecutiveFailures()).toBe(0);
    });

    it('失败投递应记录 failure', () => {
      manager.registerChannel('ch1');
      manager.recordDelivery('ch1', false);
      manager.recordDelivery('ch1', false);
      expect(manager.getCircuitBreaker('ch1')?.getState()).toBe('open');
    });
  });

  describe('健康度同步', () => {
    it('syncAllFromHealthMonitor 应批量更新所有通道', () => {
      const snapshots: ChannelHealthSnapshot[] = [
        makeSnapshot('ch1', 'healthy'),
        makeSnapshot('ch2', 'unhealthy'),
      ];

      const mockMonitor = {
        getAllHealth: () => snapshots,
      };

      manager.bindHealthMonitor(mockMonitor as any);
      manager.syncAllFromHealthMonitor();

      expect(manager.getCircuitBreaker('ch1')?.getState()).toBe('closed');
      expect(manager.getCircuitBreaker('ch2')?.getState()).toBe('open');
    });

    it('未绑定 monitor 时 syncAllFromHealthMonitor 应跳过', () => {
      manager.syncAllFromHealthMonitor();
      expect(manager.listBreakers()).toHaveLength(0);
    });
  });

  describe('listBreakers / listOpenCircuits', () => {
    it('应列出所有熔断器', () => {
      manager.registerChannel('ch1');
      manager.registerChannel('ch2');
      expect(manager.listBreakers()).toHaveLength(2);
    });

    it('listOpenCircuits 应仅返回非 closed 的通道', () => {
      manager.registerChannel('ch1');
      manager.registerChannel('ch2');

      // ch2 熔断
      manager.recordDelivery('ch2', false);
      manager.recordDelivery('ch2', false);

      const open = manager.listOpenCircuits();
      expect(open).toEqual(['ch2']);
    });
  });

  describe('resetAll / clear', () => {
    it('resetAll 应重置所有熔断器', () => {
      manager.registerChannel('ch1');
      manager.recordDelivery('ch1', false);
      manager.recordDelivery('ch1', false);

      manager.resetAll();
      expect(manager.getCircuitBreaker('ch1')?.getState()).toBe('closed');
    });

    it('clear 应清空所有熔断器', () => {
      manager.registerChannel('ch1');
      manager.registerChannel('ch2');
      manager.clear();
      expect(manager.listBreakers()).toHaveLength(0);
    });
  });
});

describe('全局 channelCircuitBreakerManager 单例', () => {
  it('应为可用实例', () => {
    expect(channelCircuitBreakerManager).toBeInstanceOf(ChannelCircuitBreakerManager);
  });
});
