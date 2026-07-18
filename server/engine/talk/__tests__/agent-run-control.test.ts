// 代理运行控制测试，覆盖意图分类、status/cancel/steer 模式匹配。
import { describe, expect, it } from "vitest";
import {
  buildRealtimeVoiceAgentCancelProviderResult,
  classifyRealtimeVoiceAgentControlText,
  normalizeRealtimeVoiceAgentControlMode,
  parseRealtimeVoiceAgentControlToolArgs,
  resolveRealtimeVoiceAgentControlIntent,
  shouldAutoControlRealtimeVoiceAgentText,
} from "../agent-run-control.js";

describe("realtime voice agent run control intent", () => {
  it("classifies cancel commands with high confidence", () => {
    const intent = resolveRealtimeVoiceAgentControlIntent({ text: "cancel that" });
    expect(intent.mode).toBe("cancel");
    expect(intent.confidence).toBe("high");
    expect(intent.shouldAutoControl).toBe(true);
  });

  it("classifies status queries with high confidence", () => {
    const intent = resolveRealtimeVoiceAgentControlIntent({ text: "what's the status?" });
    expect(intent.mode).toBe("status");
    expect(intent.confidence).toBe("high");
  });

  it("classifies stop-redirect as steer, not cancel", () => {
    const intent = resolveRealtimeVoiceAgentControlIntent({ text: "stop using that tool" });
    expect(intent.mode).toBe("steer");
    expect(intent.shouldAutoControl).toBe(true);
  });

  it("respects explicit mode override", () => {
    const intent = resolveRealtimeVoiceAgentControlIntent({ text: "hello", mode: "cancel" });
    expect(intent.mode).toBe("cancel");
    expect(intent.reason).toBe("explicit_mode");
    expect(intent.confidence).toBe("high");
  });

  it("falls back to status with low confidence for unclassifiable text", () => {
    const intent = resolveRealtimeVoiceAgentControlIntent({ text: "random chitchat" });
    expect(intent.mode).toBe("status");
    expect(intent.confidence).toBe("low");
    expect(intent.shouldAutoControl).toBe(false);
  });
});

describe("realtime voice agent control helpers", () => {
  it("classifies control text and checks auto-control safety", () => {
    expect(classifyRealtimeVoiceAgentControlText("cancel that")).toBe("cancel");
    expect(shouldAutoControlRealtimeVoiceAgentText("cancel that")).toBe(true);
    expect(shouldAutoControlRealtimeVoiceAgentText("random chitchat")).toBe(false);
  });

  it("normalizes control mode values", () => {
    expect(normalizeRealtimeVoiceAgentControlMode("status")).toBe("status");
    expect(normalizeRealtimeVoiceAgentControlMode("CANCEL")).toBe("cancel");
    expect(normalizeRealtimeVoiceAgentControlMode("invalid")).toBeUndefined();
    expect(normalizeRealtimeVoiceAgentControlMode(undefined)).toBeUndefined();
  });

  it("parses control tool args from object and JSON string", () => {
    expect(parseRealtimeVoiceAgentControlToolArgs({ text: "stop", mode: "cancel" })).toEqual({
      text: "stop",
      mode: "cancel",
    });
    expect(parseRealtimeVoiceAgentControlToolArgs('{"text":"status","mode":"status"}')).toEqual({
      text: "status",
      mode: "status",
    });
    // Plain string becomes the text with inferred mode.
    expect(parseRealtimeVoiceAgentControlToolArgs("cancel that").mode).toBe("cancel");
  });

  it("throws when text is missing in tool args", () => {
    expect(() => parseRealtimeVoiceAgentControlToolArgs({ mode: "cancel" })).toThrow(
      "text required",
    );
  });

  it("builds a cancel provider result", () => {
    const result = buildRealtimeVoiceAgentCancelProviderResult("Stopped.");
    expect(result).toEqual({ status: "cancelled", message: "Stopped." });
    expect(buildRealtimeVoiceAgentCancelProviderResult().message).toBeTruthy();
  });
});
