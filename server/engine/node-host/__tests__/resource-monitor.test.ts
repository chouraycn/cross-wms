import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { ResourceMonitor, createResourceMonitor } from '../resource-monitor.js';

describe('node-host/resource-monitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = createResourceMonitor({ sampleIntervalMs: 50 });
  });

  afterEach(() => {
    monitor.stop();
    monitor.clearHistory();
  });

  describe('start / stop', () => {
    it('start 启动监控', () => {
      expect(monitor.isActive()).toBe(false);
      monitor.start();
      expect(monitor.isActive()).toBe(true);
    });

    it('stop 停止监控', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isActive()).toBe(false);
    });

    it('重复 start 不会创建多个实例', () => {
      monitor.start();
      monitor.start();
      monitor.stop();
      expect(monitor.isActive()).toBe(false);
    });
  });

  describe('snapshot', () => {
    it('初始时没有 snapshot', () => {
      expect(monitor.getCurrentSnapshot()).toBeNull();
    });

    it('启动后产生 snapshot', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 100));
      const snapshot = monitor.getCurrentSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot?.memoryBytes).toBeGreaterThan(0);
      expect(snapshot?.timestamp).toBeGreaterThan(0);
      expect(snapshot?.uptimeMs).toBeGreaterThan(0);
    });
  });

  describe('history', () => {
    it('getHistory 返回历史快照', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 200));
      const history = monitor.getHistory();
      expect(history.length).toBeGreaterThan(1);
    });

    it('clearHistory 清空历史', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 100));
      monitor.clearHistory();
      expect(monitor.getSnapshotCount()).toBe(0);
    });

    it('getSnapshotCount 返回快照数量', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 150));
      expect(monitor.getSnapshotCount()).toBeGreaterThan(0);
    });
  });

  describe('统计', () => {
    it('getAverage 返回平均值', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 150));
      const avg = monitor.getAverage();
      expect(avg).not.toBeNull();
      expect(avg?.memoryBytes).toBeGreaterThan(0);
      expect(avg?.cpuPercent).toBeGreaterThanOrEqual(0);
    });

    it('getAverage 带时间窗口', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 150));
      const avg = monitor.getAverage(1000);
      expect(avg).not.toBeNull();
    });

    it('getPeak 返回峰值', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 150));
      const peak = monitor.getPeak();
      expect(peak).not.toBeNull();
      expect(peak?.memoryBytes).toBeGreaterThan(0);
    });

    it('无数据时返回 null', () => {
      expect(monitor.getAverage()).toBeNull();
      expect(monitor.getPeak()).toBeNull();
    });
  });

  describe('uptime', () => {
    it('getUptimeMs 未启动时为 0', () => {
      expect(monitor.getUptimeMs()).toBe(0);
    });

    it('启动后 uptime 增加', async () => {
      monitor.start();
      const t0 = monitor.getUptimeMs();
      await new Promise(r => setTimeout(r, 50));
      const t1 = monitor.getUptimeMs();
      expect(t1).toBeGreaterThan(t0);
    });
  });

  describe('配置', () => {
    it('setMaxMemoryMB 设置内存限制', () => {
      monitor.setMaxMemoryMB(512);
    });

    it('setMaxCpuPercent 设置 CPU 限制', () => {
      monitor.setMaxCpuPercent(75);
    });
  });

  describe('阈值回调', () => {
    it('onExceedLimit 在超限时被调用', async () => {
      const onExceed = vi.fn();
      const m = createResourceMonitor({
        sampleIntervalMs: 10,
        maxMemoryMB: 0.001,
        maxCpuPercent: 0.001,
        onExceedLimit: onExceed,
      });
      m.start();
      await new Promise(r => setTimeout(r, 50));
      m.stop();
      expect(onExceed).toHaveBeenCalled();
    });
  });
});
