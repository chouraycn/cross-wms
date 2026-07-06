import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freezeTime } from '../frozen-time';

describe('Frozen Time 测试', () => {
  describe('freezeTime', () => {
    it('应该冻结时间', () => {
      const testTime = Date.now();
      const { cleanup } = freezeTime({ now: testTime });

      expect(Date.now()).toBe(testTime);
      expect(new Date().getTime()).toBe(testTime);

      cleanup();
    });

    it('应该在冻结期间保持时间不变', () => {
      const testTime = Date.now();
      const { cleanup } = freezeTime({ now: testTime });

      const time1 = Date.now();
      const time2 = Date.now();

      expect(time1).toBe(time2);
      expect(time1).toBe(testTime);

      cleanup();
    });

    it('应该支持 advance 方法', () => {
      const testTime = Date.now();
      const { frozen, cleanup } = freezeTime({ now: testTime });

      frozen.advance(1000);
      expect(Date.now()).toBe(testTime + 1000);

      frozen.advance(500);
      expect(Date.now()).toBe(testTime + 1500);

      cleanup();
    });

    it('应该支持 set 方法', () => {
      const testTime = Date.now();
      const { frozen, cleanup } = freezeTime({ now: testTime });

      const newTime = testTime + 5000;
      frozen.set(newTime);
      expect(Date.now()).toBe(newTime);

      cleanup();
    });

    it('应该支持 Date 对象作为初始时间', () => {
      const testDate = new Date('2024-01-01T00:00:00.000Z');
      const { cleanup } = freezeTime({ now: testDate });

      expect(Date.now()).toBe(testDate.getTime());
      expect(new Date().toISOString()).toBe('2024-01-01T00:00:00.000Z');

      cleanup();
    });

    it('应该恢复原始时间函数', () => {
      const originalNow = Date.now;
      const { cleanup } = freezeTime();

      cleanup();

      expect(Date.now).toBe(originalNow);
    });

    it('应该冻结 performance.now', () => {
      const testTime = Date.now();
      const { cleanup } = freezeTime({ now: testTime });

      expect(performance.now()).toBe(testTime);

      cleanup();
    });

    it('应该支持 shouldAdvance 模式', () => {
      const testTime = Date.now();
      const { cleanup } = freezeTime({ now: testTime, shouldAdvance: true });

      const time1 = Date.now();
      const time2 = Date.now();

      expect(time2).toBe(time1 + 1);

      cleanup();
    });
  });
});