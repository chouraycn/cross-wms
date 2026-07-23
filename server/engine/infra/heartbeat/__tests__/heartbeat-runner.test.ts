import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { HeartbeatRunner, createHeartbeatRunner } from "../heartbeat-runner.js";

describe("createHeartbeatRunner", () => {
  it("应该返回 HeartbeatRunner 实例", () => {
    const runner = createHeartbeatRunner({ intervalMs: 1_000 });
    expect(runner).toBeInstanceOf(HeartbeatRunner);
    expect(runner.isRunning()).toBe(false);
  });

  it("应该支持 autoStart 选项立即启动", () => {
    const runner = createHeartbeatRunner({ autoStart: true, intervalMs: 1_000, initialDelayMs: 1_000 });
    expect(runner.isRunning()).toBe(true);
    runner.stop();
  });
});

describe("HeartbeatRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("start / stop", () => {
    it("start 应该将状态切换为 running 并触发 onStart", () => {
      const onStart = vi.fn();
      const runner = new HeartbeatRunner({ intervalMs: 1_000, initialDelayMs: 5_000, onStart });
      runner.start();
      expect(runner.isRunning()).toBe(true);
      expect(onStart).toHaveBeenCalledTimes(1);
      runner.stop();
    });

    it("重复 start 不应再次触发 onStart", () => {
      const onStart = vi.fn();
      const runner = new HeartbeatRunner({ intervalMs: 1_000, initialDelayMs: 5_000, onStart });
      runner.start();
      runner.start();
      expect(onStart).toHaveBeenCalledTimes(1);
      runner.stop();
    });

    it("stop 应该将状态切换为 stopped 并触发 onStop", () => {
      const onStop = vi.fn();
      const runner = new HeartbeatRunner({ intervalMs: 1_000, initialDelayMs: 5_000, onStop });
      runner.start();
      runner.stop();
      expect(runner.isRunning()).toBe(false);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("未运行时 stop 应为空操作", () => {
      const onStop = vi.fn();
      const runner = new HeartbeatRunner({ onStop });
      runner.stop();
      expect(onStop).not.toHaveBeenCalled();
    });
  });

  describe("beat 调度", () => {
    it("initialDelay 后应调用 onBeat 并递增 beatCount", async () => {
      const onBeat = vi.fn().mockResolvedValue(undefined);
      const runner = new HeartbeatRunner({
        intervalMs: 1_000,
        initialDelayMs: 100,
        onBeat,
      });
      runner.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(onBeat).toHaveBeenCalledTimes(1);
      expect(runner.getBeatCount()).toBe(1);
      runner.stop();
    });

    it("initialDelay=0 时应立即触发首次 beat", async () => {
      const onBeat = vi.fn().mockResolvedValue(undefined);
      const runner = new HeartbeatRunner({ intervalMs: 1_000, initialDelayMs: 0, onBeat });
      runner.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(onBeat).toHaveBeenCalledTimes(1);
      expect(runner.getBeatCount()).toBe(1);
      runner.stop();
    });

    it("应该按 interval 持续触发 beat", async () => {
      const onBeat = vi.fn().mockResolvedValue(undefined);
      const runner = new HeartbeatRunner({
        intervalMs: 1_000,
        initialDelayMs: 0,
        jitterMs: 0,
        onBeat,
      });
      runner.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(runner.getBeatCount()).toBe(3);
      runner.stop();
    });
  });

  describe("错误处理", () => {
    it("onBeat 抛错时应调用 onError 并记录 errorCount", async () => {
      const error = new Error("beat-failed");
      const onBeat = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      const runner = new HeartbeatRunner({
        intervalMs: 10_000,
        initialDelayMs: 0,
        onBeat,
        onError,
      });
      runner.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(onError).toHaveBeenCalledWith(error);
      expect(runner.getState().getErrorCount()).toBe(1);
      runner.stop();
    });

    it("triggerBeat 在未运行时应抛错", async () => {
      const runner = new HeartbeatRunner({ intervalMs: 1_000 });
      await expect(runner.triggerBeat()).rejects.toThrow("Heartbeat is not running");
    });

    it("triggerBeat 应立即触发一次 beat 并清除已有定时器", async () => {
      const onBeat = vi.fn().mockResolvedValue(undefined);
      const runner = new HeartbeatRunner({
        intervalMs: 10_000,
        initialDelayMs: 5_000,
        onBeat,
      });
      runner.start();
      await runner.triggerBeat();
      expect(onBeat).toHaveBeenCalledTimes(1);
      expect(runner.getBeatCount()).toBe(1);
      runner.stop();
    });
  });

  describe("setInterval", () => {
    it("应该同时更新 schedule 与 state 的 interval", () => {
      const runner = new HeartbeatRunner({ intervalMs: 1_000, minIntervalMs: 100 });
      runner.setInterval(5_000);
      expect(runner.getSchedule().getInterval()).toBe(5_000);
      expect(runner.getState().getIntervalMs()).toBe(5_000);
    });
  });

  describe("isStale / getLastBeatTime", () => {
    it("未运行时应为 stale", () => {
      const runner = new HeartbeatRunner({ intervalMs: 1_000 });
      expect(runner.isStale()).toBe(true);
    });

    it("beat 后应记录 lastBeatTime", async () => {
      const onBeat = vi.fn().mockResolvedValue(undefined);
      const runner = new HeartbeatRunner({ intervalMs: 1_000, initialDelayMs: 0, onBeat });
      runner.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(runner.getLastBeatTime()).toBeDefined();
      runner.stop();
    });
  });
});
