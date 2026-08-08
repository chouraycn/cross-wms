import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TypingIndicator, TypingCallbacks } from "../typing.js";

describe("TypingIndicator 模块单元测试", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应该记录 channelId 和 userId", () => {
    const indicator = new TypingIndicator("ch-1", "user-1");
    expect(indicator.channelId).toBe("ch-1");
    expect(indicator.userId).toBe("user-1");
  });

  it("初始化时 startedAt 和 expiresAt 应该有效", () => {
    const before = Date.now();
    const indicator = new TypingIndicator("ch-1", "user-1");
    const after = Date.now();

    expect(indicator.startedAt).toBeGreaterThanOrEqual(before);
    expect(indicator.startedAt).toBeLessThanOrEqual(after);
    expect(indicator.expiresAt).toBe(indicator.startedAt + 5000);
  });

  it("isExpired 在创建后应返回 false", () => {
    const indicator = new TypingIndicator("ch-1", "user-1");
    expect(indicator.isExpired()).toBe(false);
  });

  it("isExpired 在 TTL 过后应返回 true", () => {
    const indicator = new TypingIndicator("ch-1", "user-1", 1);
    expect(indicator.isExpired()).toBe(false);

    vi.advanceTimersByTime(2);
    expect(indicator.isExpired()).toBe(true);
  });

  it("refresh 应该刷新过期时间", () => {
    const indicator = new TypingIndicator("ch-1", "user-1", 100);
    const oldExpires = indicator.expiresAt;

    vi.advanceTimersByTime(50);
    indicator.refresh();

    expect(indicator.expiresAt).toBeGreaterThan(oldExpires);
    expect(indicator.isExpired()).toBe(false);
  });
});

describe("TypingCallbacks 模块单元测试", () => {
  let typingCallbacks: TypingCallbacks;

  beforeEach(() => {
    typingCallbacks = new TypingCallbacks(0); // 禁用自动清理定时器
  });

  afterEach(() => {
    typingCallbacks.dispose();
  });

  describe("onTypingStart / onTypingStop", () => {
    it("onTypingStart 应该记录输入状态", () => {
      typingCallbacks.onTypingStart("ch-1", "user-1");
      expect(typingCallbacks.getActiveTypers("ch-1")).toContain("user-1");
    });

    it("onTypingStop 应该移除输入状态", () => {
      typingCallbacks.onTypingStart("ch-1", "user-1");
      typingCallbacks.onTypingStop("ch-1", "user-1");
      expect(typingCallbacks.getActiveTypers("ch-1")).toHaveLength(0);
    });

    it("同一用户重复 onTypingStart 应该刷新而不是重复", () => {
      const cb = { onTypingStart: vi.fn(), onTypingStop: vi.fn() };
      typingCallbacks.addCallback(cb);

      typingCallbacks.onTypingStart("ch-1", "user-1");
      typingCallbacks.onTypingStart("ch-1", "user-1");

      expect(cb.onTypingStart).toHaveBeenCalledTimes(1);
      expect(typingCallbacks.getActiveTypers("ch-1")).toEqual(["user-1"]);
    });

    it("多个频道应该独立管理", () => {
      typingCallbacks.onTypingStart("ch-1", "user-1");
      typingCallbacks.onTypingStart("ch-2", "user-2");

      expect(typingCallbacks.getActiveTypers("ch-1")).toEqual(["user-1"]);
      expect(typingCallbacks.getActiveTypers("ch-2")).toEqual(["user-2"]);
    });

    it("同一频道多个用户应该都能被记录", () => {
      typingCallbacks.onTypingStart("ch-1", "user-1");
      typingCallbacks.onTypingStart("ch-1", "user-2");

      const typers = typingCallbacks.getActiveTypers("ch-1");
      expect(typers).toHaveLength(2);
      expect(typers).toContain("user-1");
      expect(typers).toContain("user-2");
    });
  });

  describe("回调触发", () => {
    it("应该触发 onTypingStart 回调", () => {
      const cb = { onTypingStart: vi.fn(), onTypingStop: vi.fn() };
      typingCallbacks.addCallback(cb);

      typingCallbacks.onTypingStart("ch-1", "user-1");
      expect(cb.onTypingStart).toHaveBeenCalledWith("ch-1", "user-1");
      expect(cb.onTypingStop).not.toHaveBeenCalled();
    });

    it("应该触发 onTypingStop 回调", () => {
      const cb = { onTypingStart: vi.fn(), onTypingStop: vi.fn() };
      typingCallbacks.addCallback(cb);

      typingCallbacks.onTypingStart("ch-1", "user-1");
      typingCallbacks.onTypingStop("ch-1", "user-1");
      expect(cb.onTypingStop).toHaveBeenCalledWith("ch-1", "user-1");
    });

    it("应该支持移除回调", () => {
      const cb = { onTypingStart: vi.fn(), onTypingStop: vi.fn() };
      typingCallbacks.addCallback(cb);
      typingCallbacks.removeCallback(cb);

      typingCallbacks.onTypingStart("ch-1", "user-1");
      expect(cb.onTypingStart).not.toHaveBeenCalled();
    });
  });

  describe("过期清理", () => {
    it("getActiveTypers 应该过滤过期项", () => {
      const tc = new TypingCallbacks(0);
      const indicator = new TypingIndicator("ch-1", "user-1", -1); // 已过期

      // 手动注入过期指示器
      (tc as any).indicators.set("ch-1", new Map([["user-1", indicator]]));

      expect(tc.getActiveTypers("ch-1")).toHaveLength(0);
      tc.dispose();
    });

    it("cleanupExpired 应该清理过期项并触发回调", () => {
      const tc = new TypingCallbacks(0);
      const cb = { onTypingStop: vi.fn() };
      tc.addCallback(cb);

      const indicator = new TypingIndicator("ch-1", "user-1", -1);
      (tc as any).indicators.set("ch-1", new Map([["user-1", indicator]]));

      tc.cleanupExpired();
      expect(cb.onTypingStop).toHaveBeenCalledWith("ch-1", "user-1");
      expect((tc as any).indicators.has("ch-1")).toBe(false);
      tc.dispose();
    });
  });

  describe("dispose", () => {
    it("应该清除所有状态和定时器", () => {
      const tc = new TypingCallbacks(100);
      tc.onTypingStart("ch-1", "user-1");
      tc.dispose();

      expect((tc as any).indicators.size).toBe(0);
      expect((tc as any).cleanupTimer).toBeUndefined();
    });
  });
});
