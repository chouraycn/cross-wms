import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { HeartbeatState } from "../heartbeat-state.js";

describe("HeartbeatState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z").getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("构造与初始状态", () => {
    it("应该以 stopped 状态初始化并记录 intervalMs 与 label", () => {
      const state = new HeartbeatState(5_000, "agent-1");
      expect(state.getStatus()).toBe("stopped");
      expect(state.isRunning()).toBe(false);
      expect(state.getIntervalMs()).toBe(5_000);
      expect(state.getLabel()).toBe("agent-1");
      expect(state.getBeatCount()).toBe(0);
      expect(state.getErrorCount()).toBe(0);
      expect(state.getLastBeatTime()).toBeUndefined();
      expect(state.getStartTime()).toBeUndefined();
    });

    it("应该允许不带 label 构造", () => {
      const state = new HeartbeatState(1_000);
      expect(state.getLabel()).toBeUndefined();
    });
  });

  describe("start / stop", () => {
    it("start 应该将状态切换为 running 并记录开始时间", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      expect(state.isRunning()).toBe(true);
      expect(state.getStatus()).toBe("running");
      expect(state.getStartTime()).toBe(Date.now());
    });

    it("stop 应该将状态切换为 stopped", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      state.stop();
      expect(state.isRunning()).toBe(false);
      expect(state.getStatus()).toBe("stopped");
    });
  });

  describe("beat", () => {
    it("应该递增 beatCount 并记录 lastBeatTime", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      state.beat();
      expect(state.getBeatCount()).toBe(1);
      expect(state.getLastBeatTime()).toBe(Date.now());
      vi.advanceTimersByTime(1_000);
      state.beat();
      expect(state.getBeatCount()).toBe(2);
    });
  });

  describe("error", () => {
    it("应该递增 errorCount 并记录 lastError（Error 对象）", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      state.error(new Error("boom"));
      expect(state.getErrorCount()).toBe(1);
      expect(state.getLastError()).toBe("boom");
    });

    it("应该将字符串错误转换为字符串", () => {
      const state = new HeartbeatState(1_000);
      state.error("string error");
      expect(state.getErrorCount()).toBe(1);
      expect(state.getLastError()).toBe("string error");
    });
  });

  describe("setIntervalMs", () => {
    it("应该将 intervalMs 限制在不低于 100", () => {
      const state = new HeartbeatState(1_000);
      state.setIntervalMs(10);
      expect(state.getIntervalMs()).toBe(100);
    });

    it("应该接受合法的 intervalMs", () => {
      const state = new HeartbeatState(1_000);
      state.setIntervalMs(20_000);
      expect(state.getIntervalMs()).toBe(20_000);
    });
  });

  describe("getUptimeMs", () => {
    it("未启动时应返回 0", () => {
      const state = new HeartbeatState(1_000);
      expect(state.getUptimeMs()).toBe(0);
    });

    it("启动后应返回经过的时间", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      vi.advanceTimersByTime(5_000);
      expect(state.getUptimeMs()).toBe(5_000);
    });
  });

  describe("isStale", () => {
    it("未运行时应返回 true", () => {
      const state = new HeartbeatState(1_000);
      expect(state.isStale()).toBe(true);
    });

    it("运行但从未 beat 时应返回 true", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      expect(state.isStale()).toBe(true);
    });

    it("最近 beat 过且未超过阈值时应返回 false", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      state.beat();
      vi.advanceTimersByTime(500);
      expect(state.isStale()).toBe(false);
    });

    it("超过默认阈值（intervalMs * 3）时应返回 true", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      state.beat();
      vi.advanceTimersByTime(3_500);
      expect(state.isStale()).toBe(true);
    });

    it("应支持自定义阈值", () => {
      const state = new HeartbeatState(1_000);
      state.start();
      state.beat();
      vi.advanceTimersByTime(2_000);
      expect(state.isStale(5_000)).toBe(false);
      expect(state.isStale(1_000)).toBe(true);
    });
  });

  describe("getSnapshot", () => {
    it("应该返回状态的浅拷贝", () => {
      const state = new HeartbeatState(1_000, "lbl");
      state.start();
      state.beat();
      const snap = state.getSnapshot();
      expect(snap.status).toBe("running");
      expect(snap.beatCount).toBe(1);
      expect(snap.intervalMs).toBe(1_000);
      expect(snap.label).toBe("lbl");
      // 修改快照不应影响内部状态
      snap.beatCount = 999;
      expect(state.getBeatCount()).toBe(1);
    });
  });
});
