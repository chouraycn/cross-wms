// Talk 日志投影测试，覆盖 delta 过滤、warn 级别、属性提取与日志失败隔离。
import { describe, expect, it, vi } from "vitest";
import type { TalkEvent } from "../talk-events.js";
import { createTalkLogRecord, recordTalkLogEvent } from "../logging.js";

const mocks = vi.hoisted(() => {
  const infoMock = vi.fn();
  const warnMock = vi.fn();
  const childMock = vi.fn(() => ({
    info: infoMock,
    warn: warnMock,
    debug: vi.fn(),
    error: vi.fn(),
  }));
  return { infoMock, warnMock, childMock };
});

vi.mock("../../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: mocks.childMock,
  },
}));

const { infoMock, warnMock } = mocks;

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

describe("createTalkLogRecord", () => {
  it("returns undefined for noisy delta event types", () => {
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "input.audio.delta" })),
    ).toBeUndefined();
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "output.audio.delta" })),
    ).toBeUndefined();
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "output.text.delta" })),
    ).toBeUndefined();
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "transcript.delta" })),
    ).toBeUndefined();
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "tool.progress" })),
    ).toBeUndefined();
  });

  it("produces an info record for normal lifecycle events", () => {
    const record = createTalkLogRecord(makeTalkEvent({ type: "session.started" }));
    expect(record?.level).toBe("info");
    expect(record?.message).toBe("talk event session.started");
    expect(record?.attributes).toMatchObject({
      sessionId: "session-1",
      talkEventType: "session.started",
      talkMode: "realtime",
      talkTransport: "webrtc",
      talkBrain: "agent-consult",
    });
  });

  it("produces a warn record for session.error and tool.error", () => {
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "session.error" }))?.level,
    ).toBe("warn");
    expect(
      createTalkLogRecord(makeTalkEvent({ type: "tool.error" }))?.level,
    ).toBe("warn");
  });

  it("includes provider, final, durationMs and byteLength attributes when present", () => {
    const record = createTalkLogRecord(
      makeTalkEvent({
        type: "output.audio.done",
        provider: "openai",
        final: true,
        payload: { durationMs: 120, byteLength: 4800 },
      }),
    );
    expect(record?.attributes).toMatchObject({
      talkProvider: "openai",
      talkFinal: true,
      talkDurationMs: 120,
      talkByteLength: 4800,
    });
  });

  it("reads latencyMs/audioBytes aliases for log attributes", () => {
    const record = createTalkLogRecord(
      makeTalkEvent({ payload: { latencyMs: 9, audioBytes: 32 } }),
    );
    expect(record?.attributes.talkDurationMs).toBe(9);
    expect(record?.attributes.talkByteLength).toBe(32);
  });

  it("omits duration/byteLength attributes when payload lacks finite numbers", () => {
    const record = createTalkLogRecord(
      makeTalkEvent({ payload: { durationMs: "nope", byteLength: -1 } }),
    );
    expect(record?.attributes).not.toHaveProperty("talkDurationMs");
    expect(record?.attributes).not.toHaveProperty("talkByteLength");
  });
});

describe("recordTalkLogEvent", () => {
  it("writes info records through the talk logger", () => {
    infoMock.mockClear();
    warnMock.mockClear();
    recordTalkLogEvent(makeTalkEvent({ type: "session.started" }));
    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(infoMock.mock.calls[0][1]).toBe("talk event session.started");
  });

  it("writes warn records through the talk logger for error events", () => {
    infoMock.mockClear();
    warnMock.mockClear();
    recordTalkLogEvent(makeTalkEvent({ type: "session.error" }));
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][1]).toBe("talk event session.error");
  });

  it("skips logging entirely for noisy delta events", () => {
    infoMock.mockClear();
    warnMock.mockClear();
    recordTalkLogEvent(makeTalkEvent({ type: "input.audio.delta" }));
    expect(infoMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });
});
