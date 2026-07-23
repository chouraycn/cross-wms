import { describe, expect, it, vi } from "vitest";
import { createHeartbeatTypingCallbacks } from "../heartbeat-typing.js";

const baseTarget = {
  channel: "telegram",
  to: "user-1",
  accountId: "acc1",
  threadId: null,
};

describe("createHeartbeatTypingCallbacks", () => {
  it("无 plugin.sendTyping 时应返回 undefined", () => {
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
    });
    expect(result).toBeUndefined();
  });

  it("无 to 时应返回 undefined", () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: { ...baseTarget, to: "   " },
      plugin: { heartbeat: { sendTyping } },
    });
    expect(result).toBeUndefined();
  });

  it("有 sendTyping 与 to 时应返回包含 onReplyStart 的回调", async () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping } },
    });
    expect(result).toBeDefined();
    expect(result?.onReplyStart).toBeTypeOf("function");
    await result?.onReplyStart?.();
    expect(sendTyping).toHaveBeenCalledTimes(1);
    // 应传入包含 to 与 accountId 的 target
    const passedTarget = sendTyping.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(passedTarget.to).toBe("user-1");
    expect(passedTarget.accountId).toBe("acc1");
  });

  it("onReplyStart 中 sendTyping 抛错时不应抛出，应调用 log.debug", async () => {
    const sendTyping = vi.fn().mockRejectedValue(new Error("network"));
    const logDebug = vi.fn();
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping } },
      log: { debug: logDebug },
    });
    await expect(result?.onReplyStart?.()).resolves.toBeUndefined();
    expect(logDebug).toHaveBeenCalledTimes(1);
    expect(logDebug.mock.calls[0]?.[0]).toContain("telegram");
  });

  it("有 clearTyping 时应提供 onReplyEnd 与 onCleanup", async () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const clearTyping = vi.fn().mockResolvedValue(undefined);
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping, clearTyping } },
    });
    expect(result?.onReplyEnd).toBeTypeOf("function");
    expect(result?.onCleanup).toBeTypeOf("function");
    await result?.onReplyEnd?.();
    expect(clearTyping).toHaveBeenCalledTimes(1);
    await result?.onCleanup?.();
    expect(clearTyping).toHaveBeenCalledTimes(2);
  });

  it("无 clearTyping 时不应提供 onReplyEnd", () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping } },
    });
    expect(result?.onReplyEnd).toBeUndefined();
    // onCleanup 仍应存在但不调用 clearTyping
    expect(result?.onCleanup).toBeTypeOf("function");
  });

  it("onCleanup 中 clearTyping 抛错时不应抛出", async () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const clearTyping = vi.fn().mockRejectedValue(new Error("cleanup-fail"));
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping, clearTyping } },
    });
    await expect(result?.onCleanup?.()).resolves.toBeUndefined();
  });

  it("应该使用自定义 typingIntervalSeconds 计算 keepaliveIntervalMs", () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping } },
      typingIntervalSeconds: 10,
    }) as Record<string, unknown>;
    expect(result.keepaliveIntervalMs).toBe(10_000);
  });

  it("未提供 typingIntervalSeconds 时应使用默认 6 秒", () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const result = createHeartbeatTypingCallbacks({
      cfg: {},
      target: baseTarget,
      plugin: { heartbeat: { sendTyping } },
    }) as Record<string, unknown>;
    expect(result.keepaliveIntervalMs).toBe(6_000);
  });
});
