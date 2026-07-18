// 咨询问题测试，覆盖问题读取、模糊匹配与可朗读工具结果提取。
import { describe, expect, it } from "vitest";
import {
  matchRealtimeVoiceConsultQuestions,
  normalizeRealtimeVoiceConsultQuestion,
  readRealtimeVoiceConsultQuestion,
  readSpeakableRealtimeVoiceToolResult,
} from "../consult-question.js";

describe("consult question", () => {
  it("reads question from string or object keys", () => {
    expect(readRealtimeVoiceConsultQuestion("  what time is it? ")).toBe("what time is it?");
    expect(readRealtimeVoiceConsultQuestion({ question: "hello" })).toBe("hello");
    expect(readRealtimeVoiceConsultQuestion({ prompt: "hello" })).toBe("hello");
    expect(readRealtimeVoiceConsultQuestion({ unrelated: "x" })).toBeUndefined();
    expect(readRealtimeVoiceConsultQuestion(undefined)).toBeUndefined();
    expect(readRealtimeVoiceConsultQuestion("  ")).toBeUndefined();
  });

  it("normalizes questions for stable matching", () => {
    expect(normalizeRealtimeVoiceConsultQuestion("  What's  the  Status? ")).toBe(
      "what s the status",
    );
    expect(normalizeRealtimeVoiceConsultQuestion(undefined)).toBeUndefined();
    expect(normalizeRealtimeVoiceConsultQuestion("")).toBeUndefined();
  });

  it("matches questions with exact, containment, and token overlap", () => {
    expect(matchRealtimeVoiceConsultQuestions("hello world", "hello world")).toBe(true);
    expect(matchRealtimeVoiceConsultQuestions("please check the status", "check status")).toBe(
      true,
    );
    expect(matchRealtimeVoiceConsultQuestions("check inventory levels", "check status")).toBe(
      false,
    );
    expect(matchRealtimeVoiceConsultQuestions(undefined, "hello")).toBe(false);
  });
});

describe("speakable tool result", () => {
  it("reads speakable text from string or object result keys", () => {
    expect(readSpeakableRealtimeVoiceToolResult("done")).toBe("done");
    expect(readSpeakableRealtimeVoiceToolResult({ text: "result text" })).toBe("result text");
    expect(readSpeakableRealtimeVoiceToolResult({ output: "output text" })).toBe("output text");
    expect(readSpeakableRealtimeVoiceToolResult({ unrelated: "x" })).toBeUndefined();
    expect(readSpeakableRealtimeVoiceToolResult(undefined)).toBeUndefined();
  });

  it("appends truncation marker when result exceeds max chars", () => {
    const longText = "x".repeat(2000);
    const result = readSpeakableRealtimeVoiceToolResult(longText, { maxChars: 100 });
    expect(result).toContain("[truncated]");
    expect(result?.length).toBeLessThanOrEqual(100);
  });

  it("returns undefined for empty string result", () => {
    expect(readSpeakableRealtimeVoiceToolResult("   ")).toBeUndefined();
    expect(readSpeakableRealtimeVoiceToolResult({ text: "  " })).toBeUndefined();
  });
});
