// 会话日志运行时测试，覆盖转录/事件环形缓冲、健康摘要、回声检测与抑制扩展。
import { describe, expect, it } from "vitest";
import type { RealtimeVoiceBridgeEvent } from "../provider-types.js";
import {
  extendRealtimeVoiceOutputEchoSuppression,
  getRealtimeVoiceBridgeEventHealth,
  getRealtimeVoiceTranscriptHealth,
  isLikelyRealtimeVoiceAssistantEchoTranscript,
  recordRealtimeVoiceBridgeEvent,
  recordRealtimeVoiceTranscript,
} from "../session-log-runtime.js";

describe("recordRealtimeVoiceTranscript", () => {
  it("appends an entry and returns it with an ISO timestamp", () => {
    const transcript: ReturnType<typeof recordRealtimeVoiceTranscript>[] = [];
    const entry = recordRealtimeVoiceTranscript(transcript, "user", "hello");
    expect(transcript).toHaveLength(1);
    expect(entry.role).toBe("user");
    expect(entry.text).toBe("hello");
    expect(typeof entry.at).toBe("string");
    expect(new Date(entry.at).getTime()).not.toBeNaN();
  });

  it("trims old entries to the configured max size", () => {
    const transcript: { at: string; role: "user"; text: string }[] = [];
    for (let i = 0; i < 5; i++) {
      recordRealtimeVoiceTranscript(transcript, "user", `line-${i}`, 3);
    }
    expect(transcript).toHaveLength(3);
    expect(transcript[0].text).toBe("line-2");
    expect(transcript[2].text).toBe("line-4");
  });
});

describe("getRealtimeVoiceTranscriptHealth", () => {
  it("summarizes an empty transcript", () => {
    const health = getRealtimeVoiceTranscriptHealth([]);
    expect(health.realtimeTranscriptLines).toBe(0);
    expect(health.lastRealtimeTranscriptAt).toBeUndefined();
    expect(health.recentRealtimeTranscript).toEqual([]);
  });

  it("reports the last entry and the recent 5 entries", () => {
    const transcript: { at: string; role: "user" | "assistant"; text: string }[] = [];
    for (let i = 0; i < 7; i++) {
      recordRealtimeVoiceTranscript(transcript, "user", `line-${i}`);
    }
    const health = getRealtimeVoiceTranscriptHealth(transcript);
    expect(health.realtimeTranscriptLines).toBe(7);
    expect(health.lastRealtimeTranscriptText).toBe("line-6");
    expect(health.recentRealtimeTranscript).toHaveLength(5);
    expect(health.recentRealtimeTranscript[0].text).toBe("line-2");
  });
});

describe("recordRealtimeVoiceBridgeEvent", () => {
  it("drops client input_audio_buffer.append events to keep diagnostics small", () => {
    const events: { at: string; direction: string; type: string }[] = [];
    recordRealtimeVoiceBridgeEvent(events, {
      direction: "client",
      type: "input_audio_buffer.append",
    });
    expect(events).toHaveLength(0);
  });

  it("records other bridge events with an ISO timestamp and trims to max size", () => {
    const events: { at: string; direction: "client" | "server"; type: string }[] = [];
    for (let i = 0; i < 5; i++) {
      recordRealtimeVoiceBridgeEvent(events, { direction: "server", type: `evt-${i}` }, 3);
    }
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("evt-2");
    expect(typeof events[0].at).toBe("string");
  });
});

describe("getRealtimeVoiceBridgeEventHealth", () => {
  it("summarizes an empty event list", () => {
    const health = getRealtimeVoiceBridgeEventHealth([]);
    expect(health.lastRealtimeEventAt).toBeUndefined();
    expect(health.lastRealtimeEventType).toBeUndefined();
    expect(health.recentRealtimeEvents).toEqual([]);
  });

  it("reports direction:type and the recent 10 events", () => {
    const events: { at: string; direction: "server"; type: string }[] = [];
    for (let i = 0; i < 12; i++) {
      recordRealtimeVoiceBridgeEvent(events, { direction: "server", type: `t-${i}` });
    }
    const health = getRealtimeVoiceBridgeEventHealth(events);
    expect(health.lastRealtimeEventType).toBe("server:t-11");
    expect(health.recentRealtimeEvents).toHaveLength(10);
  });
});

describe("isLikelyRealtimeVoiceAssistantEchoTranscript", () => {
  it("returns false for short user text", () => {
    expect(
      isLikelyRealtimeVoiceAssistantEchoTranscript({
        transcript: [],
        text: "hi",
        lookbackMs: 5000,
      }),
    ).toBe(false);
  });

  it("returns false when there is no recent assistant transcript", () => {
    expect(
      isLikelyRealtimeVoiceAssistantEchoTranscript({
        transcript: [],
        text: "the quick brown fox jumps over the lazy dog",
        lookbackMs: 5000,
      }),
    ).toBe(false);
  });

  it("detects substring echo of recent assistant text", () => {
    const now = Date.now();
    const transcript = [
      {
        at: new Date(now - 100).toISOString(),
        role: "assistant" as const,
        text: "the quick brown fox jumps over the lazy dog and keeps running",
      },
    ];
    expect(
      isLikelyRealtimeVoiceAssistantEchoTranscript({
        transcript,
        text: "the quick brown fox jumps over the lazy dog and keeps running",
        lookbackMs: 5000,
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("ignores assistant entries outside the lookback window", () => {
    const now = Date.now();
    const transcript = [
      {
        at: new Date(now - 10000).toISOString(),
        role: "assistant" as const,
        text: "the quick brown fox jumps over the lazy dog and keeps running",
      },
    ];
    expect(
      isLikelyRealtimeVoiceAssistantEchoTranscript({
        transcript,
        text: "the quick brown fox jumps over the lazy dog and keeps running",
        lookbackMs: 5000,
        nowMs: now,
      }),
    ).toBe(false);
  });
});

describe("extendRealtimeVoiceOutputEchoSuppression", () => {
  it("computes playback duration and extends suppression beyond playback end", () => {
    const result = extendRealtimeVoiceOutputEchoSuppression({
      audio: Buffer.alloc(1600),
      bytesPerMs: 16,
      tailMs: 200,
      nowMs: 1000,
      lastOutputPlayableUntilMs: 1000,
      suppressInputUntilMs: 1000,
    });
    expect(result.durationMs).toBe(100);
    expect(result.lastOutputPlayableUntilMs).toBe(1100);
    expect(result.suppressInputUntilMs).toBe(1300);
  });

  it("queues playback after the previous tail when overlapping", () => {
    const result = extendRealtimeVoiceOutputEchoSuppression({
      audio: Buffer.alloc(1600),
      bytesPerMs: 16,
      tailMs: 200,
      nowMs: 1000,
      lastOutputPlayableUntilMs: 2000,
      suppressInputUntilMs: 1500,
    });
    expect(result.lastOutputPlayableUntilMs).toBe(2100);
    expect(result.suppressInputUntilMs).toBe(2300);
  });

  it("keeps the existing suppression if it already extends further", () => {
    const result = extendRealtimeVoiceOutputEchoSuppression({
      audio: Buffer.alloc(160),
      bytesPerMs: 16,
      tailMs: 50,
      nowMs: 1000,
      lastOutputPlayableUntilMs: 1000,
      suppressInputUntilMs: 5000,
    });
    expect(result.durationMs).toBe(10);
    expect(result.lastOutputPlayableUntilMs).toBe(1010);
    expect(result.suppressInputUntilMs).toBe(5000);
  });
});
