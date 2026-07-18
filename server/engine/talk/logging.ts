// Talk logging helpers write voice session logs and diagnostic entries.
// 自包含实现，参考 openclaw/src/talk/logging.ts。
// 用项目 logger (../../logger.js) 替代 openclaw 的 getChildLogger。
import { logger as rootLogger } from "../../logger.js";
import { asOptionalRecord, firstFiniteTalkEventNumber } from "./event-metrics.js";
import type { TalkEvent, TalkEventType } from "./talk-events.js";

/**
 * Log severity produced from Talk event envelopes.
 */
type TalkLogLevel = "info" | "warn";

/**
 * Compact structured log record for a non-noisy Talk event.
 */
type TalkLogRecord = {
  level: TalkLogLevel;
  message: string;
  attributes: Record<string, string | number | boolean>;
};

// Delta events can arrive at audio/text chunk cadence; omitting them keeps logs useful
// without hiding lifecycle, error, usage, and latency events.
const OMITTED_TALK_LOG_EVENT_TYPES = new Set<TalkEventType>([
  "input.audio.delta",
  "output.audio.delta",
  "output.text.delta",
  "transcript.delta",
  "tool.progress",
]);

const TALK_LOGGER_BINDINGS = Object.freeze({ subsystem: "talk" });

function createTalkLogger(): typeof rootLogger {
  if (typeof (rootLogger as { child?: unknown }).child === "function") {
    return (rootLogger as { child: (bindings: Record<string, unknown>) => typeof rootLogger }).child(TALK_LOGGER_BINDINGS as Record<string, unknown>);
  }
  return rootLogger;
}

const talkLogger = createTalkLogger();

/**
 * Converts high-level Talk events into compact structured log records, skipping noisy deltas.
 */
export function createTalkLogRecord(event: TalkEvent): TalkLogRecord | undefined {
  if (OMITTED_TALK_LOG_EVENT_TYPES.has(event.type)) {
    return undefined;
  }

  const payload = asOptionalRecord(event.payload);
  const attributes: Record<string, string | number | boolean> = {
    sessionId: event.sessionId,
    talkEventType: event.type,
    talkMode: event.mode,
    talkTransport: event.transport,
    talkBrain: event.brain,
  };

  if (event.provider) {
    attributes.talkProvider = event.provider;
  }
  if (typeof event.final === "boolean") {
    attributes.talkFinal = event.final;
  }

  const durationMs = firstFiniteTalkEventNumber(payload, ["durationMs", "latencyMs", "elapsedMs"]);
  if (durationMs !== undefined) {
    attributes.talkDurationMs = durationMs;
  }
  const byteLength = firstFiniteTalkEventNumber(payload, ["byteLength", "audioBytes"]);
  if (byteLength !== undefined) {
    attributes.talkByteLength = byteLength;
  }

  return {
    level: event.type === "session.error" || event.type === "tool.error" ? "warn" : "info",
    message: `talk event ${event.type}`,
    attributes,
  };
}

/**
 * Emits Talk logs best-effort so logging failures never break realtime audio handling.
 */
export function recordTalkLogEvent(event: TalkEvent): void {
  const record = createTalkLogRecord(event);
  if (!record) {
    return;
  }

  try {
    if (record.level === "warn") {
      talkLogger.warn(record.attributes, record.message);
      return;
    }
    talkLogger.info(record.attributes, record.message);
  } catch {
    // logging must never block the realtime Talk path
  }
}
