import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  HeartbeatSchedule,
  calculateNextBeatTime,
  isBeatDue,
} from "../heartbeat-schedule.js";

describe("calculateNextBeatTime", () => {
  it("应该返回 lastBeatTime + intervalMs", () => {
    expect(calculateNextBeatTime(1_000, 5_000)).toBe(6_000);
  });

  it("应该支持零间隔", () => {
    expect(calculateNextBeatTime(100, 0)).toBe(100);
  });
});

describe("isBeatDue", () => {
  it("当 now - lastBeatTime >= intervalMs 时应返回 true", () => {
    expect(isBeatDue(1_000, 5_000, 6_000)).toBe(true);
  });

  it("当 now - lastBeatTime < intervalMs 时应返回 false", () => {
    expect(isBeatDue(1_000, 5_000, 4_000)).toBe(false);
  });

  it("当刚好等于 intervalMs 时应返回 true", () => {
    expect(isBeatDue(1_000, 5_000, 6_000)).toBe(true);
  });

  it("应该默认使用 Date.now()", () => {
    const now = Date.now();
    expect(isBeatDue(now - 10_000, 5_000)).toBe(true);
    expect(isBeatDue(now - 1_000, 5_000)).toBe(false);
  });
});

describe("HeartbeatSchedule", () => {
  describe("默认构造", () => {
    it("应该使用默认间隔与边界", () => {
      const sched = new HeartbeatSchedule();
      expect(sched.getBaseInterval()).toBe(30_000);
      expect(sched.getMinInterval()).toBe(1_000);
      expect(sched.getMaxInterval()).toBe(300_000);
      expect(sched.getInterval()).toBe(30_000);
      expect(sched.getInitialDelay()).toBe(0);
      expect(sched.getErrorStreak()).toBe(0);
    });
  });

  describe("自定义构造", () => {
    it("应该尊重传入的选项", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 10_000,
        jitterMs: 100,
        initialDelayMs: 500,
        minIntervalMs: 2_000,
        maxIntervalMs: 50_000,
        backoffFactor: 2,
      });
      expect(sched.getBaseInterval()).toBe(10_000);
      expect(sched.getInitialDelay()).toBe(500);
      expect(sched.getMinInterval()).toBe(2_000);
      expect(sched.getMaxInterval()).toBe(50_000);
    });
  });

  describe("getNextDelay", () => {
    it("无 jitter 时应返回当前间隔", () => {
      const sched = new HeartbeatSchedule({ intervalMs: 10_000, jitterMs: 0 });
      expect(sched.getNextDelay()).toBe(10_000);
    });

    it("应将 delay 限制在 [minInterval, maxInterval] 范围内", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 1_000,
        minIntervalMs: 5_000,
        maxIntervalMs: 10_000,
      });
      expect(sched.getNextDelay()).toBe(5_000);
    });
  });

  describe("onSuccess / onError backoff", () => {
    it("onError 应该递增 errorStreak 并扩大当前间隔", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 10_000,
        backoffFactor: 2,
        maxIntervalMs: 100_000,
      });
      expect(sched.getErrorStreak()).toBe(0);
      sched.onError();
      expect(sched.getErrorStreak()).toBe(1);
      expect(sched.getInterval()).toBe(20_000);
      sched.onError();
      expect(sched.getErrorStreak()).toBe(2);
      expect(sched.getInterval()).toBe(40_000);
    });

    it("onError 不应超过 maxIntervalMs", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 10_000,
        backoffFactor: 10,
        maxIntervalMs: 50_000,
      });
      sched.onError();
      expect(sched.getInterval()).toBe(50_000);
    });

    it("onSuccess 应该重置 errorStreak 与当前间隔", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 10_000,
        backoffFactor: 2,
      });
      sched.onError();
      sched.onError();
      expect(sched.getErrorStreak()).toBe(2);
      sched.onSuccess();
      expect(sched.getErrorStreak()).toBe(0);
      expect(sched.getInterval()).toBe(10_000);
    });
  });

  describe("reset", () => {
    it("应该重置 errorStreak 与当前间隔", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 10_000,
        backoffFactor: 2,
      });
      sched.onError();
      sched.reset();
      expect(sched.getErrorStreak()).toBe(0);
      expect(sched.getInterval()).toBe(10_000);
    });
  });

  describe("setInterval", () => {
    it("应该将新的 interval 限制在 [minInterval, maxInterval] 内", () => {
      const sched = new HeartbeatSchedule({
        intervalMs: 10_000,
        minIntervalMs: 5_000,
        maxIntervalMs: 50_000,
      });
      sched.setInterval(1_000);
      expect(sched.getInterval()).toBe(5_000);
      expect(sched.getBaseInterval()).toBe(5_000);
      sched.setInterval(100_000);
      expect(sched.getInterval()).toBe(50_000);
    });
  });
});
