/**
 * Privacy-preserving Talk diagnostic event projection.
 *
 * The diagnostic stream needs timing and size counters for reliability work,
 * but must not export raw provider payloads, transcripts, or audio content.
 *
 * 自包含实现，参考 openclaw/src/talk/diagnostics.ts。
 * 用本地诊断事件总线替代 openclaw 的 infra/diagnostic-events。
 */
import { asOptionalRecord, firstFiniteTalkEventNumber } from "./event-metrics.js";
import type { TalkEvent } from "./talk-events.js";

/** 隐私安全的 Talk 诊断事件投影。 */
export type TalkDiagnosticEventInput = {
  type: "talk.event";
  sessionId: string;
  turnId?: string;
  captureId?: string;
  talkEventType: string;
  mode: string;
  transport: string;
  brain: string;
  provider?: string;
  final?: boolean;
  durationMs?: number;
  byteLength?: number;
};

/** 诊断事件监听器。 */
type DiagnosticEventListener = (event: TalkDiagnosticEventInput) => void;

// 本地诊断事件订阅者集合（替代 openclaw 的 trusted diagnostic event 通道）。
const diagnosticListeners = new Set<DiagnosticEventListener>();

/** 订阅 Talk 诊断事件，返回取消订阅函数。 */
export function subscribeTalkDiagnosticEvents(
  listener: DiagnosticEventListener,
): () => void {
  diagnosticListeners.add(listener);
  return () => {
    diagnosticListeners.delete(listener);
  };
}

/** 清除所有诊断事件订阅者（主要供测试使用）。 */
export function clearTalkDiagnosticEventListeners(): void {
  diagnosticListeners.clear();
}

/** 向本地诊断事件总线发送一个可信诊断事件。 */
export function emitTrustedDiagnosticEvent(event: TalkDiagnosticEventInput): void {
  for (const listener of diagnosticListeners) {
    try {
      listener(event);
    } catch {
      // 诊断监听器异常不得影响 Talk 投递。
    }
  }
}

/** Convert a Talk event into the bounded diagnostic payload shape. */
export function createTalkDiagnosticEvent(event: TalkEvent): TalkDiagnosticEventInput {
  const payload = asOptionalRecord(event.payload);
  return {
    type: "talk.event",
    sessionId: event.sessionId,
    turnId: event.turnId,
    captureId: event.captureId,
    talkEventType: event.type,
    mode: event.mode,
    transport: event.transport,
    brain: event.brain,
    provider: event.provider,
    final: event.final,
    // Read only known numeric aliases from provider payloads; raw payload text
    // and audio bytes stay out of diagnostics.
    durationMs: firstFiniteTalkEventNumber(payload, ["durationMs", "latencyMs", "elapsedMs"]),
    byteLength: firstFiniteTalkEventNumber(payload, ["byteLength", "audioBytes"]),
  };
}

/** Emit a trusted internal diagnostic event for one Talk event. */
export function recordTalkDiagnosticEvent(event: TalkEvent): void {
  emitTrustedDiagnosticEvent(createTalkDiagnosticEvent(event));
}
