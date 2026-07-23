// 可观测性 facade 测试，覆盖诊断与日志双通道投递。
import { describe, expect, it, vi } from "vitest";
import type { TalkEvent } from "../talk-events.js";
import { recordTalkObservabilityEvent } from "../observability.js";
import * as diagnostics from "../diagnostics.js";
import * as logging from "../logging.js";

function makeTalkEvent(overrides: Partial<TalkEvent> = {}): TalkEvent {
  return {
    sessionId: "session-1",
    mode: "realtime",
    transport: "webrtc",
    brain: "agent-consult",
    id: "session-1:1",
    type: "session.started",
    seq: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("recordTalkObservabilityEvent", () => {
  it("routes the event through both diagnostics and logging projections", () => {
    const diagSpy = vi
      .spyOn(diagnostics, "recordTalkDiagnosticEvent")
      .mockImplementation(() => undefined);
    const logSpy = vi
      .spyOn(logging, "recordTalkLogEvent")
      .mockImplementation(() => undefined);
    const event = makeTalkEvent({ type: "session.started" });
    recordTalkObservabilityEvent(event);
    expect(diagSpy).toHaveBeenCalledWith(event);
    expect(logSpy).toHaveBeenCalledWith(event);
    diagSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("warn level events still flow through both channels", () => {
    const diagSpy = vi
      .spyOn(diagnostics, "recordTalkDiagnosticEvent")
      .mockImplementation(() => undefined);
    const logSpy = vi
      .spyOn(logging, "recordTalkLogEvent")
      .mockImplementation(() => undefined);
    const event = makeTalkEvent({ type: "session.error" });
    recordTalkObservabilityEvent(event);
    expect(diagSpy).toHaveBeenCalledWith(event);
    expect(logSpy).toHaveBeenCalledWith(event);
    diagSpy.mockRestore();
    logSpy.mockRestore();
  });
});
