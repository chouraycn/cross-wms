import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  resolveIndicatorType,
  emitHeartbeatEvent,
  onHeartbeatEvent,
  getLastHeartbeatEvent,
  resetHeartbeatEventsForTest,
} from "../heartbeat-events.js";
import type { HeartbeatEventPayload } from "../heartbeat-events.js";

describe("resolveIndicatorType", () => {
  it("ok-empty 应映射为 'ok'", () => {
    expect(resolveIndicatorType("ok-empty")).toBe("ok");
  });

  it("ok-token 应映射为 'ok'", () => {
    expect(resolveIndicatorType("ok-token")).toBe("ok");
  });

  it("sent 应映射为 'alert'", () => {
    expect(resolveIndicatorType("sent")).toBe("alert");
  });

  it("failed 应映射为 'error'", () => {
    expect(resolveIndicatorType("failed")).toBe("error");
  });

  it("skipped 应映射为 undefined", () => {
    expect(resolveIndicatorType("skipped")).toBeUndefined();
  });
});

describe("heartbeat 事件存储与广播", () => {
  beforeEach(() => {
    resetHeartbeatEventsForTest();
  });

  afterEach(() => {
    resetHeartbeatEventsForTest();
  });

  describe("emitHeartbeatEvent / getLastHeartbeatEvent", () => {
    it("应该存储最后一次事件并自动附加 ts", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-01T00:00:00Z").getTime());
      emitHeartbeatEvent({ status: "sent", to: "user-1" });
      const last = getLastHeartbeatEvent();
      expect(last).not.toBeNull();
      expect(last?.status).toBe("sent");
      expect(last?.to).toBe("user-1");
      expect(last?.ts).toBe(Date.now());
      vi.useRealTimers();
    });

    it("getLastHeartbeatEvent 在无事件时应返回 null", () => {
      expect(getLastHeartbeatEvent()).toBeNull();
    });

    it("应该用最新事件覆盖之前的事件", () => {
      emitHeartbeatEvent({ status: "sent" });
      emitHeartbeatEvent({ status: "failed", reason: "timeout" });
      const last = getLastHeartbeatEvent();
      expect(last?.status).toBe("failed");
      expect(last?.reason).toBe("timeout");
    });
  });

  describe("onHeartbeatEvent", () => {
    it("应该通知已注册的监听器", () => {
      const received: HeartbeatEventPayload[] = [];
      const unsubscribe = onHeartbeatEvent((evt) => received.push(evt));
      emitHeartbeatEvent({ status: "sent" });
      expect(received).toHaveLength(1);
      expect(received[0]?.status).toBe("sent");
      unsubscribe();
    });

    it("取消订阅后不应再收到事件", () => {
      const received: HeartbeatEventPayload[] = [];
      const unsubscribe = onHeartbeatEvent((evt) => received.push(evt));
      unsubscribe();
      emitHeartbeatEvent({ status: "sent" });
      expect(received).toHaveLength(0);
    });

    it("一个监听器抛出错误不应影响其他监听器", () => {
      const calls: string[] = [];
      onHeartbeatEvent(() => {
        throw new Error("listener boom");
      });
      onHeartbeatEvent((evt) => calls.push(evt.status));
      expect(() => emitHeartbeatEvent({ status: "sent" })).not.toThrow();
      expect(calls).toEqual(["sent"]);
    });

    it("应该支持多个监听器同时接收事件", () => {
      const a: string[] = [];
      const b: string[] = [];
      onHeartbeatEvent((evt) => a.push(evt.status));
      onHeartbeatEvent((evt) => b.push(evt.status));
      emitHeartbeatEvent({ status: "ok-empty" });
      expect(a).toEqual(["ok-empty"]);
      expect(b).toEqual(["ok-empty"]);
    });
  });

  describe("resetHeartbeatEventsForTest", () => {
    it("应该清除最后事件与所有监听器", () => {
      const received: HeartbeatEventPayload[] = [];
      onHeartbeatEvent((evt) => received.push(evt));
      emitHeartbeatEvent({ status: "sent" });
      resetHeartbeatEventsForTest();
      expect(getLastHeartbeatEvent()).toBeNull();
      emitHeartbeatEvent({ status: "failed" });
      expect(received).toHaveLength(1);
    });
  });
});
