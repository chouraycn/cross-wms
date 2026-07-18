import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageTracker } from '../usageTracker.js';

describe('UsageTracker', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker();
  });

  describe('track', () => {
    it('应记录单次使用', () => {
      tracker.track('gpt-4', 100, 50, 0.002);
      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalTokensIn).toBe(100);
      expect(stats.totalTokensOut).toBe(50);
      expect(stats.totalCost).toBe(0.002);
    });

    it('应累积多次记录', () => {
      tracker.track('gpt-4', 100, 50, 0.002);
      tracker.track('gpt-4', 200, 100, 0.004);
      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.totalTokensIn).toBe(300);
      expect(stats.totalTokensOut).toBe(150);
      expect(stats.totalCost).toBe(0.006);
    });

    it('应按模型分组统计', () => {
      tracker.track('gpt-4', 100, 50, 0.002);
      tracker.track('gpt-3.5', 50, 25, 0.001);
      const stats = tracker.getStats();
      expect(stats.byModel['gpt-4'].calls).toBe(1);
      expect(stats.byModel['gpt-3.5'].calls).toBe(1);
    });
  });

  describe('getStats with sessionId', () => {
    it('应仅返回指定会话的统计', () => {
      tracker.track('gpt-4', 100, 50, 0.002, 'session-a');
      tracker.track('gpt-4', 200, 100, 0.004, 'session-b');

      const statsA = tracker.getStats('session-a');
      expect(statsA.totalCalls).toBe(1);
      expect(statsA.totalTokensIn).toBe(100);

      const statsAll = tracker.getStats();
      expect(statsAll.totalCalls).toBe(2);
    });

    it('未匹配会话应返回零值', () => {
      tracker.track('gpt-4', 100, 50, 0.002, 'session-a');
      const stats = tracker.getStats('not-exist');
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalCost).toBe(0);
    });
  });

  describe('getDailySummary', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应按日期汇总', () => {
      const date1 = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(date1);
      tracker.track('gpt-4', 100, 50, 0.002);

      const date2 = new Date('2024-01-16T12:00:00Z');
      vi.setSystemTime(date2);
      tracker.track('gpt-4', 200, 100, 0.004);
      tracker.track('gpt-4', 50, 25, 0.001);

      const summary = tracker.getDailySummary();
      expect(summary).toHaveLength(2);
      expect(summary[0].date).toBe('2024-01-15');
      expect(summary[0].tokensIn).toBe(100);
      expect(summary[1].date).toBe('2024-01-16');
      expect(summary[1].tokensIn).toBe(250);
      expect(summary[1].cost).toBe(0.005);
    });
  });

  describe('reset', () => {
    it('应清空所有记录', () => {
      tracker.track('gpt-4', 100, 50, 0.002);
      tracker.reset();
      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(Object.keys(stats.byModel)).toHaveLength(0);
    });
  });
});
