// 诊断事件投影测试，覆盖订阅/清除、事件投影与监听器异常隔离。
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TalkEvent } from "../talk-events.js";
import {
  clearTalkDiagnosticEventListeners,
  createTalkDiagnosticEvent,
  emitTrustedDiagnosticEvent,
  recordTalkDiagnosticEvent,
  subscribeTalkDiagnosticEvents,
} from "../diagnostics.js";

function makeTalkEvent(overrides: Partial<TalkEvent> = {}): TalkEvent {
  return {
    sessionId: "session-1",
    mode: "realtime",
    transport: "webrtc",
    brain: "agent-consult",
    id: "session-1:1",
    type: "output.audio.done",
    seq: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("diagnostic event listeners", () => {
  afterEach(() => {
    clearTalkDiagnosticEventListeners();
  });

  it("delivers emitted events to subscribers and supports unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTalkDiagnosticEvents(listener);
    const event = { type: "talk.event", sessionId: "s1", talkEventType: "x", mode: "realtime", transport: "webrtc", brain: "agent-consult" } as const;
    emitTrustedDiagnosticEvent(event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
    unsubscribe();
    emitTrustedDiagnosticEvent(event);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears all listeners", () => {
    const listener = vi.fn();
    subscribeTalkDiagnosticEvents(listener);
    clearTalkDiagnosticEventListeners();
    emitTrustedDiagnosticEvent({
      type: "talk.event",
      sessionId: "s1",
      talkEventType: "x",
      mode: "realtime",
      transport: "webrtc",
      brain: "agent-consult",
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates listener exceptions from other listeners and the emitter", () => {
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const after = vi.fn();
    subscribeTalkDiagnosticEvents(throwing);
    subscribeTalkDiagnosticEvents(after);
    expect(() =>
      emitTrustedDiagnosticEvent({
        type: "talk.event",
        sessionId: "s1",
        talkEventType: "x",
        mode: "realtime",
        transport: "webrtc",
        brain: "agent-consult",
      }),
    ).not.toThrow();
    expect(throwing).toHaveBeenCalled();
    expect(after).toHaveBeenCalled();
  });
});

describe("createTalkDiagnosticEvent", () => {
  it("projects a Talk event into the bounded diagnostic shape", () => {
    const event = makeTalkEvent({
      type: "output.audio.done",
      payload: { durationMs: 120, byteLength: 4800 },
      provider: "openai",
      final: true,
      turnId: "turn-1",
      captureId: "cap-1",
    });
    const diagnostic = createTalkDiagnosticEvent(event);
    expect(diagnostic).toMatchObject({
      type: "talk.event",
      sessionId: "session-1",
      turnId: "turn-1",
      captureId: "cap-1",
      talkEventType: "output.audio.done",
      mode: "realtime",
      transport: "webrtc",
      brain: "agent-consult",
      provider: "openai",
      final: true,
      durationMs: 120,
      byteLength: 4800,
    });
  });

  it("reads numeric aliases durationMs/latencyMs/elapsedMs and byteLength/audioBytes", () => {
    expect(
      createTalkDiagnosticEvent(makeTalkEvent({ payload: { latencyMs: 9 } })).durationMs,
    ).toBe(9);
    expect(
      createTalkDiagnosticEvent(makeTalkEvent({ payload: { elapsedMs: 5 } })).durationMs,
    ).toBe(5);
    expect(
      createTalkDiagnosticEvent(makeTalkEvent({ payload: { audioBytes: 32 } })).byteLength,
    ).toBe(32);
  });

  it("leaves durationMs/byteLength undefined for non-numeric or missing payloads", () => {
    const diagnostic = createTalkDiagnosticEvent(
      makeTalkEvent({ payload: { durationMs: "nope", byteLength: -1 } }),
    );
    expect(diagnostic.durationMs).toBeUndefined();
    expect(diagnostic.byteLength).toBeUndefined();
  });

  it("keeps payload out of the diagnostic projection", () => {
    const diagnostic = createTalkDiagnosticEvent(
      makeTalkEvent({ payload: { secret: "leak" } }),
    );
    expect(diagnostic).not.toHaveProperty("secret");
  });
});

describe("recordTalkDiagnosticEvent", () => {
  afterEach(() => {
    clearTalkDiagnosticEventListeners();
  });

  it("emits a projected diagnostic event for a Talk event", () => {
    const listener = vi.fn();
    subscribeTalkDiagnosticEvents(listener);
    recordTalkDiagnosticEvent(makeTalkEvent({ type: "session.error" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].talkEventType).toBe("session.error");
  });
});
