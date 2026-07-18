// 轮次上下文追踪器测试，覆盖 open/markAudio/close/consume 生命周期与 ignored context。
import { describe, expect, it } from "vitest";
import { createRealtimeVoiceTurnContextTracker } from "../turn-context-tracker.js";

describe("realtime voice turn context tracker", () => {
  it("opens a turn and consumes its audio context after audio is marked", () => {
    const tracker = createRealtimeVoiceTurnContextTracker<string>({ now: () => 1000 });
    const handle = tracker.open("turn-context-1");
    expect(handle.context).toBe("turn-context-1");
    expect(handle.hasAudio).toBe(false);

    expect(tracker.consumeAudioContext()).toBeUndefined();

    tracker.markAudio(handle);
    expect(handle.hasAudio).toBe(true);
    expect(tracker.consumeAudioContext()).toBe("turn-context-1");
    // After consuming, the audio context is removed.
    expect(tracker.consumeAudioContext()).toBeUndefined();
  });

  it("remembers and consumes ignored context within TTL", () => {
    let now = 1000;
    const tracker = createRealtimeVoiceTurnContextTracker<string>({
      now: () => now,
      ignoredContextTtlMs: 5_000,
    });

    tracker.rememberIgnoredContext("ignored-1");
    expect(tracker.consumeIgnoredContext()).toBe("ignored-1");
    // After consuming, it is cleared.
    expect(tracker.consumeIgnoredContext()).toBeUndefined();

    tracker.rememberIgnoredContext("ignored-2");
    now += 6_000; // past TTL
    expect(tracker.consumeIgnoredContext()).toBeUndefined();
  });

  it("prunes closed silent turns but keeps audio-bearing closed turns until consumed", () => {
    const tracker = createRealtimeVoiceTurnContextTracker<string>({ now: () => 1000 });
    const silent = tracker.open("silent");
    tracker.close(silent);
    expect(tracker.size()).toBe(0);

    const audio = tracker.open("audio");
    tracker.markAudio(audio);
    tracker.close(audio);
    // Audio-bearing closed turn is still present until consumed.
    expect(tracker.size()).toBe(1);
    expect(tracker.consumeAudioContext()).toBe("audio");
    expect(tracker.size()).toBe(0);
  });

  it("clears all state", () => {
    const tracker = createRealtimeVoiceTurnContextTracker<string>();
    const handle = tracker.open("ctx");
    tracker.markAudio(handle);
    tracker.rememberIgnoredContext("ignored");
    expect(tracker.size()).toBe(1);
    expect(tracker.hasAudioContext()).toBe(true);

    tracker.clear();
    expect(tracker.size()).toBe(0);
    expect(tracker.hasAudioContext()).toBe(false);
    expect(tracker.consumeIgnoredContext()).toBeUndefined();
  });
});
