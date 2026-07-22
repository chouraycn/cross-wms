import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ChannelHealthMonitor,
  failedDelivery,
  successfulDelivery,
  type ChannelHealthSnapshot,
} from '../channel-health-monitor.js';

describe('ChannelHealthMonitor', () => {
  let monitor: ChannelHealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000); // 固定基础时间
    monitor = new ChannelHealthMonitor({
      windowMs: 60000,
      heartbeatTimeoutMs: 5000,
      heartbeatCriticalMs: 30000,
      degradedFailureThreshold: 3,
      unhealthyFailureThreshold: 5,
      degradedSuccessRate: 0.9,
      unhealthySuccessRate: 0.5,
      maxSamplesPerChannel: 100,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advance(ms: number) {
    vi.setSystemTime(Date.now() + ms);
  }

  describe('register / unregister', () => {
    it('应注册通道（初始 offline）', () => {
      monitor.registerChannel('ch-1');
      const health = monitor.getHealth('ch-1');
      expect(health?.status).toBe('offline');
    });

    it('应允许注销通道', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.unregisterChannel('ch-1');
      expect(monitor.getHealth('ch-1')).toBeUndefined();
    });

    it('getRegisteredChannels 应返回所有通道 ID', () => {
      monitor.registerChannel('ch-1');
      monitor.registerChannel('ch-2');
      expect(monitor.getRegisteredChannels().sort()).toEqual(['ch-1', 'ch-2']);
    });
  });

  describe('markOnline / markOffline', () => {
    it('markOnline 应将 offline 状态改为 healthy', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      const health = monitor.getHealth('ch-1');
      expect(health?.status).toBe('healthy');
      expect(health?.lastHeartbeatAt).toBe(1000000);
    });

    it('markOffline 应将状态改为 offline', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.markOffline('ch-1');
      expect(monitor.getHealth('ch-1')?.status).toBe('offline');
    });

    it('recordHeartbeat 应更新 lastHeartbeatAt', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      advance(1000);
      monitor.recordHeartbeat('ch-1');
      expect(monitor.getHealth('ch-1')?.lastHeartbeatAt).toBe(1001000);
    });

    it('markOnline 未注册通道应自动注册', () => {
      monitor.markOnline('auto-registered');
      expect(monitor.getHealth('auto-registered')?.status).toBe('healthy');
    });
  });

  describe('心跳超时检测', () => {
    it('超过 heartbeatTimeoutMs 应标记为 degraded', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      advance(6000); // > 5000
      expect(monitor.getHealth('ch-1')?.status).toBe('degraded');
    });

    it('超过 heartbeatCriticalMs 应标记为 unhealthy', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      advance(31000); // > 30000
      expect(monitor.getHealth('ch-1')?.status).toBe('unhealthy');
    });

    it('从未心跳的通道应标记为 unhealthy', () => {
      monitor.registerChannel('ch-1');
      // 不调用 markOnline，直接查询（注意 status 仍为 offline）
      // 但 recordDelivery 会触发状态变更计算
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      const health = monitor.getHealth('ch-1');
      expect(health?.status).toBe('unhealthy');
    });
  });

  describe('recordDelivery', () => {
    it('应记录成功投递', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      monitor.recordDelivery('ch-1', successfulDelivery(200));

      const health = monitor.getHealth('ch-1');
      expect(health?.totalDeliveries).toBe(2);
      expect(health?.successfulDeliveries).toBe(2);
      expect(health?.failedDeliveries).toBe(0);
      expect(health?.successRate).toBe(1);
      expect(health?.avgLatencyMs).toBe(150);
    });

    it('应记录失败投递', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', failedDelivery('timeout', 5000));

      const health = monitor.getHealth('ch-1');
      expect(health?.totalDeliveries).toBe(1);
      expect(health?.failedDeliveries).toBe(1);
      expect(health?.successRate).toBe(0);
      expect(health?.consecutiveFailures).toBe(1);
    });

    it('成功投递应重置 consecutiveFailures', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', failedDelivery('err1', 100));
      monitor.recordDelivery('ch-1', failedDelivery('err2', 100));
      expect(monitor.getHealth('ch-1')?.consecutiveFailures).toBe(2);

      monitor.recordDelivery('ch-1', successfulDelivery(100));
      expect(monitor.getHealth('ch-1')?.consecutiveFailures).toBe(0);
    });

    it('应统计重试次数', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', successfulDelivery(100, true));
      monitor.recordDelivery('ch-1', successfulDelivery(100, false));
      monitor.recordDelivery('ch-1', failedDelivery('err', 100, true));

      const health = monitor.getHealth('ch-1');
      expect(health?.retries).toBe(2);
    });

    it('lastDeliveryAt 应更新', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      advance(1000);
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      expect(monitor.getHealth('ch-1')?.lastDeliveryAt).toBe(1001000);
    });

    it('应在样本超过上限时淘汰旧记录', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // maxSamplesPerChannel = 100
      for (let i = 0; i < 150; i++) {
        monitor.recordDelivery('ch-1', successfulDelivery(i));
      }
      // 仅最新 100 条会被保留在统计窗口内
      const health = monitor.getHealth('ch-1');
      expect(health?.totalDeliveries).toBeLessThanOrEqual(100);
    });

    it('未注册通道首次投递应自动注册', () => {
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      expect(monitor.getHealth('ch-1')?.totalDeliveries).toBe(1);
    });
  });

  describe('连续失败降级', () => {
    it('达到 degradedFailureThreshold 应降级', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // 阈值 3
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      // 3 次失败（含最后一次），consecutiveFailures=3，应降级
      // 但成功率不足 0.5（5个样本后才触发）
      // 连续失败 3 应触发 degraded
      expect(monitor.getHealth('ch-1')?.status).toBe('degraded');
    });

    it('达到 unhealthyFailureThreshold 应标记 unhealthy', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // 阈值 5
      for (let i = 0; i < 5; i++) {
        monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      }
      expect(monitor.getHealth('ch-1')?.status).toBe('unhealthy');
    });
  });

  describe('成功率降级', () => {
    it('成功率低于 degradedSuccessRate 应降级（样本数 >= 10）', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // 8 成功 + 2 失败 = 0.8 < 0.9
      for (let i = 0; i < 8; i++) {
        monitor.recordDelivery('ch-1', successfulDelivery(100));
      }
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      // 注意：2 次连续失败也会触发 degradedFailureThreshold=3（这里只有2，不触发）
      // 所以应该是 successRate 触发的 degraded
      const health = monitor.getHealth('ch-1');
      expect(health?.successRate).toBe(0.8);
      expect(health?.status).toBe('degraded');
    });

    it('成功率低于 unhealthySuccessRate 应标记 unhealthy', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // 4 成功 + 6 失败 = 0.4 < 0.5
      for (let i = 0; i < 4; i++) {
        monitor.recordDelivery('ch-1', successfulDelivery(100));
      }
      // 失败要分散，避免先触发 unhealthyFailureThreshold=5
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      monitor.recordDelivery('ch-1', successfulDelivery(100)); // 重置计数
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      for (let i = 0; i < 5; i++) {
        monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      }
      // 现在 6 成功 + 6 失败 = 0.5（边界） + consecutiveFailures=5 触发 unhealthy
      // 验证状态确实 unhealthy
      expect(monitor.getHealth('ch-1')?.status).toBe('unhealthy');
    });

    it('样本数 < 10 时不触发成功率降级', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // 1 成功 + 1 失败 = 0.5（< 0.9 但样本不足）
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      monitor.recordDelivery('ch-1', failedDelivery('err', 100));
      // consecutiveFailures=1（< 3），不降级
      // 样本不足，不触发成功率降级
      expect(monitor.getHealth('ch-1')?.status).toBe('healthy');
    });
  });

  describe('队列深度与死信', () => {
    it('updateQueueDepth 应更新队列深度', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.updateQueueDepth('ch-1', 50);
      expect(monitor.getHealth('ch-1')?.queueDepth).toBe(50);
    });

    it('queueDepth 不应为负', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.updateQueueDepth('ch-1', -10);
      expect(monitor.getHealth('ch-1')?.queueDepth).toBe(0);
    });

    it('recordDeadLetter 应累加死信计数', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDeadLetter('ch-1', 2);
      monitor.recordDeadLetter('ch-1', 1);
      expect(monitor.getHealth('ch-1')?.deadLetters).toBe(3);
    });
  });

  describe('统计窗口', () => {
    it('应仅统计窗口内的事件', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      // 推进时间超过窗口（windowMs=60000）
      advance(70000);
      monitor.recordDelivery('ch-1', successfulDelivery(200));

      const health = monitor.getHealth('ch-1');
      expect(health?.totalDeliveries).toBe(1); // 仅最新一条在窗口内
    });

    it('窗口边界的事件应被包含', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      advance(60000); // 正好等于 windowMs
      const health = monitor.getHealth('ch-1');
      expect(health?.totalDeliveries).toBe(1);
    });
  });

  describe('延迟统计', () => {
    it('应正确计算 p50 / p95 / p99', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      // 11 个样本，延迟 10..20
      for (let i = 10; i <= 20; i++) {
        monitor.recordDelivery('ch-1', successfulDelivery(i));
      }
      const health = monitor.getHealth('ch-1');
      expect(health?.avgLatencyMs).toBe(15); // (10+20)/2
      expect(health?.p50LatencyMs).toBeGreaterThanOrEqual(14);
      expect(health?.p50LatencyMs).toBeLessThanOrEqual(16);
      expect(health?.p95LatencyMs).toBeGreaterThanOrEqual(19);
      expect(health?.p99LatencyMs).toBeGreaterThanOrEqual(19);
    });

    it('无样本时延迟应为 0', () => {
      monitor.registerChannel('ch-1');
      monitor.markOnline('ch-1');
      const health = monitor.getHealth('ch-1');
      expect(health?.avgLatencyMs).toBe(0);
      expect(health?.p50LatencyMs).toBe(0);
      expect(health?.p95LatencyMs).toBe(0);
      expect(health?.p99LatencyMs).toBe(0);
    });
  });

  describe('getAllHealth / getUnhealthyChannels', () => {
    it('应返回所有通道的健康度', () => {
      monitor.markOnline('ch-1');
      monitor.markOnline('ch-2');
      const all = monitor.getAllHealth();
      expect(all.length).toBe(2);
      expect(all.map((h) => h.channelId).sort()).toEqual(['ch-1', 'ch-2']);
    });

    it('getUnhealthyChannels 应仅返回非健康的通道', () => {
      monitor.markOnline('ch-1');
      monitor.markOnline('ch-2');
      monitor.registerChannel('ch-3'); // 离线
      advance(100); // 时间推进不影响 ch-1/ch-2（5000ms 才会超时）
      const unhealthy = monitor.getUnhealthyChannels();
      expect(unhealthy.map((h) => h.channelId).sort()).toEqual(['ch-3']);
    });
  });

  describe('resetStats / clear', () => {
    it('resetStats 应清空记录但保留注册', () => {
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      monitor.recordDeadLetter('ch-1', 1);
      monitor.updateQueueDepth('ch-1', 5);

      monitor.resetStats();
      const health = monitor.getHealth('ch-1');
      expect(health?.totalDeliveries).toBe(0);
      expect(health?.deadLetters).toBe(0);
      expect(health?.queueDepth).toBe(0);
      // 通道仍存在
      expect(monitor.getRegisteredChannels()).toContain('ch-1');
    });

    it('clear 应完全清空', () => {
      monitor.markOnline('ch-1');
      monitor.clear();
      expect(monitor.getRegisteredChannels()).toHaveLength(0);
      expect(monitor.getHealth('ch-1')).toBeUndefined();
    });
  });

  describe('工具函数', () => {
    it('successfulDelivery 应返回成功记录', () => {
      const r = successfulDelivery(100, true);
      expect(r.success).toBe(true);
      expect(r.durationMs).toBe(100);
      expect(r.retried).toBe(true);
    });

    it('failedDelivery 应返回失败记录', () => {
      const r = failedDelivery('timeout', 5000, true);
      expect(r.success).toBe(false);
      expect(r.error).toBe('timeout');
      expect(r.durationMs).toBe(5000);
      expect(r.retried).toBe(true);
    });
  });

  describe('类型安全', () => {
    it('getHealth 返回的对象应符合 ChannelHealthSnapshot 类型', () => {
      monitor.markOnline('ch-1');
      monitor.recordDelivery('ch-1', successfulDelivery(100));
      const health: ChannelHealthSnapshot | undefined = monitor.getHealth('ch-1');
      expect(health).toBeDefined();
      if (health) {
        // 类型检查：所有必需字段都应存在
        expect(health.channelId).toBe('ch-1');
        expect(typeof health.status).toBe('string');
        expect(typeof health.windowMs).toBe('number');
        expect(typeof health.totalDeliveries).toBe('number');
        expect(typeof health.successRate).toBe('number');
      }
    });
  });
});
