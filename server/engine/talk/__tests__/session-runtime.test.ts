// 实时语音桥接会话运行时测试，覆盖音频路由、mark 策略、就绪回话与桥未就绪保护。
import { describe, expect, it, vi } from "vitest";
import { createRealtimeVoiceBridgeSession } from "../session-runtime.js";
import type {
  RealtimeVoiceBridge,
  RealtimeVoiceBridgeCreateRequest,
  RealtimeVoiceProviderPlugin,
} from "../provider-types.js";

function makeBridge(): RealtimeVoiceBridge & { _spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendAudio: vi.fn(),
    setMediaTimestamp: vi.fn(),
    sendUserMessage: vi.fn(),
    triggerGreeting: vi.fn(),
    handleBargeIn: vi.fn(),
    submitToolResult: vi.fn(),
    acknowledgeMark: vi.fn(),
    close: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
  return { ...spies, _spies: spies } as unknown as RealtimeVoiceBridge &
    { _spies: Record<string, ReturnType<typeof vi.fn>> };
}

function makeSession(overrides: {
  requestOverrides?: Partial<RealtimeVoiceBridgeCreateRequest>;
  markStrategy?: "transport" | "ack-immediately" | "ignore";
  isOpen?: () => boolean;
} = {}) {
  const bridge = makeBridge();
  const createBridge = vi.fn((request: RealtimeVoiceBridgeCreateRequest) => {
    // Capture callbacks so tests can invoke them.
    capturedRequest = request;
    return bridge;
  });
  let capturedRequest: RealtimeVoiceBridgeCreateRequest | undefined;
  const provider: RealtimeVoiceProviderPlugin = {
    id: "test",
    isConfigured: () => true,
    createBridge,
  };
  const audioSink = {
    isOpen: overrides.isOpen ?? (() => true),
    sendAudio: vi.fn(),
    clearAudio: vi.fn(),
    sendMark: vi.fn(),
  };
  const session = createRealtimeVoiceBridgeSession({
    provider,
    providerConfig: {},
    audioSink,
    markStrategy: overrides.markStrategy,
    ...overrides.requestOverrides,
  });
  return { session, bridge, audioSink, get request() { return capturedRequest!; } };
}

describe("createRealtimeVoiceBridgeSession", () => {
  it("delegates session facade calls to the underlying bridge", () => {
    const { session, bridge } = makeSession();
    session.connect();
    session.sendAudio(Buffer.from("a"));
    session.sendUserMessage("hi");
    session.setMediaTimestamp(123);
    session.handleBargeIn({ force: true });
    session.submitToolResult("call-1", { ok: true });
    session.acknowledgeMark();
    session.triggerGreeting("greet");
    session.close();
    expect(bridge._spies.connect).toHaveBeenCalled();
    expect(bridge._spies.sendAudio).toHaveBeenCalledWith(Buffer.from("a"));
    expect(bridge._spies.sendUserMessage).toHaveBeenCalledWith("hi");
    expect(bridge._spies.setMediaTimestamp).toHaveBeenCalledWith(123);
    expect(bridge._spies.handleBargeIn).toHaveBeenCalledWith({ force: true });
    expect(bridge._spies.submitToolResult).toHaveBeenCalledWith("call-1", { ok: true }, undefined);
    expect(bridge._spies.acknowledgeMark).toHaveBeenCalled();
    expect(bridge._spies.triggerGreeting).toHaveBeenCalledWith("greet");
    expect(bridge._spies.close).toHaveBeenCalled();
  });

  it("forwards provider onAudio to the sink when the sink is open", () => {
    const { request, audioSink } = makeSession({ isOpen: () => true });
    const audio = Buffer.from("chunk");
    request.onAudio?.(audio);
    expect(audioSink.sendAudio).toHaveBeenCalledWith(audio);
  });

  it("skips forwarding audio when the sink reports closed", () => {
    const { request, audioSink } = makeSession({ isOpen: () => false });
    request.onAudio?.(Buffer.from("chunk"));
    expect(audioSink.sendAudio).not.toHaveBeenCalled();
  });

  it("forwards onClearAudio to the sink when open", () => {
    const { request, audioSink } = makeSession({ isOpen: () => true });
    request.onClearAudio?.();
    expect(audioSink.clearAudio).toHaveBeenCalled();
  });

  it("uses transport mark strategy by calling audioSink.sendMark", () => {
    const { request, audioSink } = makeSession({ markStrategy: "transport" });
    request.onMark?.("mark-1");
    expect(audioSink.sendMark).toHaveBeenCalledWith("mark-1");
  });

  it("ack-immediately strategy acknowledges the bridge mark without sink", () => {
    const { request, audioSink, bridge } = makeSession({ markStrategy: "ack-immediately" });
    request.onMark?.("mark-1");
    expect(bridge._spies.acknowledgeMark).toHaveBeenCalled();
    expect(audioSink.sendMark).not.toHaveBeenCalled();
  });

  it("ignore strategy neither sends a mark nor acknowledges", () => {
    const { request, audioSink, bridge } = makeSession({ markStrategy: "ignore" });
    request.onMark?.("mark-1");
    expect(audioSink.sendMark).not.toHaveBeenCalled();
    expect(bridge._spies.acknowledgeMark).not.toHaveBeenCalled();
  });

  it("invokes onToolCall with the stable session facade", () => {
    const onToolCall = vi.fn();
    const { request, session } = makeSession({
      requestOverrides: { onToolCall },
    });
    const event = { itemId: "i1", callId: "c1", name: "tool", args: {} };
    request.onToolCall?.(event);
    expect(onToolCall).toHaveBeenCalledWith(event, session);
  });

  it("triggers greeting on ready when triggerGreetingOnReady is set", () => {
    const onReady = vi.fn();
    const { request, bridge } = makeSession({
      requestOverrides: {
        triggerGreetingOnReady: true,
        initialGreetingInstructions: "hello there",
        onReady,
      },
    });
    request.onReady?.();
    expect(bridge._spies.triggerGreeting).toHaveBeenCalledWith("hello there");
    expect(onReady).toHaveBeenCalled();
  });

  it("forwards onTranscript, onEvent, onError, and onClose verbatim", () => {
    const onTranscript = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    const { request } = makeSession({
      requestOverrides: { onTranscript, onEvent, onError, onClose },
    });
    request.onTranscript?.("user", "hi", true);
    request.onEvent?.({ direction: "server", type: "evt" });
    request.onError?.(new Error("boom"));
    request.onClose?.("completed");
    expect(onTranscript).toHaveBeenCalledWith("user", "hi", true);
    expect(onEvent).toHaveBeenCalledWith({ direction: "server", type: "evt" });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onClose).toHaveBeenCalledWith("completed");
  });
});
