import { describe, expect, it } from "vitest";
import { normalizeHeartbeatWakeReason } from "../heartbeat-reason.js";

describe("normalizeHeartbeatWakeReason", () => {
  it("应该在传入 undefined 时回退为 'requested'", () => {
    expect(normalizeHeartbeatWakeReason(undefined)).toBe("requested");
  });

  it("应该在传入空字符串时回退为 'requested'", () => {
    expect(normalizeHeartbeatWakeReason("")).toBe("requested");
  });

  it("应该在传入纯空白字符串时回退为 'requested'", () => {
    expect(normalizeHeartbeatWakeReason("   \t\n")).toBe("requested");
  });

  it("应该去除有效字符串的首尾空白并返回", () => {
    expect(normalizeHeartbeatWakeReason("  interval  ")).toBe("interval");
  });

  it("应该保留字符串内部的内容不变", () => {
    expect(normalizeHeartbeatWakeReason("cron triggered")).toBe("cron triggered");
  });
});
