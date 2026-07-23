import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT,
  HEARTBEAT_SKIP_CRON_IN_PROGRESS,
  HEARTBEAT_SKIP_LANES_BUSY,
  isRetryableHeartbeatBusySkipReason,
  setHeartbeatWakeHandler,
  hasHeartbeatWakeHandler,
  requestHeartbeat,
  hasPendingHeartbeatWake,
  resetHeartbeatWakeStateForTests,
  setHeartbeatsEnabled,
  areHeartbeatsEnabled,
} from "../heartbeat-wake.js";
import type { HeartbeatRunResult, HeartbeatWakeRequest } from "../heartbeat-wake.js";

describe("setHeartbeatsEnabled / areHeartbeatsEnabled", () => {
  afterEach(() => {
    setHeartbeatsEnabled(true);
  });

  it("默认应启用心跳", () => {
    expect(areHeartbeatsEnabled()).toBe(true);
  });

  it("应该能切换启用状态", () => {
    setHeartbeatsEnabled(false);
    expect(areHeartbeatsEnabled()).toBe(false);
    setHeartbeatsEnabled(true);
    expect(areHeartbeatsEnabled()).toBe(true);
  });
});

describe("isRetryableHeartbeatBusySkipReason", () => {
  it("应该识别 requests-in-flight 为可重试", () => {
    expect(isRetryableHeartbeatBusySkipReason(HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT)).toBe(true);
  });

  it("应该识别 cron-in-progress 为可重试", () => {
    expect(isRetryableHeartbeatBusySkipReason(HEARTBEAT_SKIP_CRON_IN_PROGRESS)).toBe(true);
  });

  it("应该识别 lanes-busy 为可重试", () => {
    expect(isRetryableHeartbeatBusySkipReason(HEARTBEAT_SKIP_LANES_BUSY)).toBe(true);
  });

  it("应该拒绝未知原因", () => {
    expect(isRetryableHeartbeatBusySkipReason("unknown")).toBe(false);
    expect(isRetryableHeartbeatBusySkipReason("")).toBe(false);
  });
});

describe("setHeartbeatWakeHandler / hasHeartbeatWakeHandler", () => {
  beforeEach(() => {
    resetHeartbeatWakeStateForTests();
  });

  afterEach(() => {
    resetHeartbeatWakeStateForTests();
  });

  it("注册 handler 后 hasHeartbeatWakeHandler 应返回 true", () => {
    expect(hasHeartbeatWakeHandler()).toBe(false);
    const cleanup = setHeartbeatWakeHandler(async () => ({ status: "ran", durationMs: 0 }));
    expect(hasHeartbeatWakeHandler()).toBe(true);
    cleanup();
    expect(hasHeartbeatWakeHandler()).toBe(false);
  });

  it("注册 null handler 应清除", () => {
    setHeartbeatWakeHandler(async () => ({ status: "ran", durationMs: 0 }));
    setHeartbeatWakeHandler(null);
    expect(hasHeartbeatWakeHandler()).toBe(false);
  });

  it("过时的 cleanup 函数不应清除新注册的 handler", () => {
    const oldCleanup = setHeartbeatWakeHandler(async () => ({ status: "ran", durationMs: 0 }));
    setHeartbeatWakeHandler(async () => ({ status: "ran", durationMs: 1 }));
    oldCleanup();
    expect(hasHeartbeatWakeHandler()).toBe(true);
  });
});

describe("requestHeartbeat / hasPendingHeartbeatWake", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHeartbeatWakeStateForTests();
  });

  afterEach(() => {
    resetHeartbeatWakeStateForTests();
    vi.useRealTimers();
  });

  it("requestHeartbeat 后应存在 pending wake", () => {
    expect(hasPendingHeartbeatWake()).toBe(false);
    requestHeartbeat({ source: "interval", intent: "scheduled" });
    expect(hasPendingHeartbeatWake()).toBe(true);
  });

  it("resetHeartbeatWakeStateForTests 应清除所有 pending 状态", () => {
    requestHeartbeat({ source: "interval", intent: "scheduled" });
    expect(hasPendingHeartbeatWake()).toBe(true);
    resetHeartbeatWakeStateForTests();
    expect(hasPendingHeartbeatWake()).toBe(false);
  });

  it("定时器触发后应调用 handler 并清空 pending", async () => {
    const calls: HeartbeatWakeRequest[] = [];
    setHeartbeatWakeHandler(async (opts) => {
      calls.push(opts);
      return { status: "ran", durationMs: 5 } satisfies HeartbeatRunResult;
    });
    requestHeartbeat({ source: "manual", intent: "manual", reason: "test" });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.source).toBe("manual");
    expect(hasPendingHeartbeatWake()).toBe(false);
  });

  it("handler 返回可重试的 busy skip 时应重新调度", async () => {
    const calls: HeartbeatRunResult[] = [];
    let callCount = 0;
    setHeartbeatWakeHandler(async () => {
      callCount++;
      if (callCount === 1) {
        calls.push({ status: "skipped", reason: HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT });
        return { status: "skipped", reason: HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT };
      }
      calls.push({ status: "ran", durationMs: 1 });
      return { status: "ran", durationMs: 1 };
    });
    requestHeartbeat({ source: "interval", intent: "scheduled" });
    // 第一次触发（coalesce 250ms）
    await vi.advanceTimersByTimeAsync(500);
    // retry 调度（1000ms）
    await vi.advanceTimersByTimeAsync(1_500);
    expect(callCount).toBe(2);
    expect(calls[1]).toEqual({ status: "ran", durationMs: 1 });
  });

  it("无 handler 时定时器触发不应抛错", async () => {
    requestHeartbeat({ source: "interval", intent: "scheduled" });
    let threw = false;
    try {
      await vi.advanceTimersByTimeAsync(500);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
