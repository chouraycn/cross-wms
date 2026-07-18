/**
 * Runtime adapter for realtime voice control of active agent runs.
 *
 * 自包含实现，合并 openclaw 的 agent-run-control-shared.ts 与 agent-run-control.ts。
 * 内联 normalizeOptionalString/normalizeOptionalLowercaseString，
 * 用注入的 deps 替代 embedded-agent-runner 依赖。
 */
import type { RealtimeVoiceTool } from "./provider-types.js";
import type { TalkEvent } from "./talk-events.js";

/** 规范化可选字符串。 */
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 规范化可选小写字符串。 */
function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

/** Provider-facing control modes for status, steering, cancellation, and follow-up work. */
export const REALTIME_VOICE_AGENT_CONTROL_MODES = [
  "status",
  "steer",
  "cancel",
  "followup",
] as const;

/** Closed set of realtime voice agent-control modes. */
export type RealtimeVoiceAgentControlMode = (typeof REALTIME_VOICE_AGENT_CONTROL_MODES)[number];

/** Provider return shape for control calls that cancel active work immediately. */
export type RealtimeVoiceAgentControlProviderResult = {
  status: "cancelled";
  message: string;
};

/** Stable provider-facing tool name for active-run voice control. */
export const REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME = "openclaw_agent_control";

/** Realtime function-tool descriptor projected to voice providers. */
export const REALTIME_VOICE_AGENT_CONTROL_TOOL: RealtimeVoiceTool = {
  type: "function",
  name: REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME,
  description:
    "Control an active tool-backed voice run. Use this when the caller asks in any language for status/progress, cancellation, a redirect/change to the active work, or a follow-up after the current work. Do not use this for ordinary greetings or chatter unless the caller is asking about the active work.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The caller's exact spoken request or a concise semantic equivalent.",
      },
      mode: {
        type: "string",
        enum: REALTIME_VOICE_AGENT_CONTROL_MODES,
        description:
          "status for progress questions, cancel for stop/abort, steer for changing the current work, followup for work to do after the current result.",
      },
    },
    required: ["text", "mode"],
  },
};

/** Classified control intent plus whether automatic tool routing is safe. */
export type RealtimeVoiceAgentControlIntent = {
  mode: RealtimeVoiceAgentControlMode;
  confidence: "high" | "medium" | "low";
  reason:
    | "explicit_mode"
    | "cancel_safety"
    | "status_query"
    | "followup_marker"
    | "steer_command"
    | "safe_default";
  shouldAutoControl: boolean;
};

/** Snapshot of active work used when recent Talk events cannot describe status. */
export type RealtimeVoiceAgentRunActivity = {
  activeWorkKind?: "tool_call" | "model_call" | "embedded_run";
  hasActiveEmbeddedRun?: boolean;
  activeToolName?: string;
  activeToolCallId?: string;
  activeToolAgeMs?: number;
  lastProgressAgeMs?: number;
  lastProgressReason?: string;
};

/** Result returned after applying or reporting a voice control request. */
export type RealtimeVoiceAgentControlResult = {
  ok: boolean;
  mode: RealtimeVoiceAgentControlMode;
  sessionKey: string;
  sessionId?: string;
  active: boolean;
  queued?: boolean;
  aborted?: boolean;
  target?: "embedded_run" | "reply_run";
  reason?: string;
  message: string;
  speak: boolean;
  show: boolean;
  suppress: boolean;
  providerResult?: RealtimeVoiceAgentControlProviderResult;
  enqueuedAtMs?: number;
  deliveredAtMs?: number;
};

/** Normalize user/config/provider supplied control modes. */
export function normalizeRealtimeVoiceAgentControlMode(
  value: unknown,
): RealtimeVoiceAgentControlMode | undefined {
  const normalized = normalizeOptionalLowercaseString(value);
  return REALTIME_VOICE_AGENT_CONTROL_MODES.includes(normalized as RealtimeVoiceAgentControlMode)
    ? (normalized as RealtimeVoiceAgentControlMode)
    : undefined;
}

const CANCEL_CONTROL_PATTERNS = [
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?(?:cancel|cancle|abort)(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?(?:never mind|nevermind|forget it|kill it|end that)(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?stop(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:can|could|would)\s+you\s+(?:please\s+)?(?:cancel|cancle|stop|abort)(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right|actually)[,\s]+)?(?:can|could|would)\s+(?:we|you)\s+(?:just\s+)?(?:cancel|cancle|stop|abort)(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
  /\b(?:cancel|cancle|stop|abort)\s+(?:that|this|it|the\s+(?:check|run|task|work))\b/,
] as const;

const STATUS_CONTROL_PATTERNS = [
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:status|progress|update)(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:give me|what'?s|any)\s+(?:an?\s+)?update(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:what'?s|where is|how is)\s+(?:the\s+)?status(?:\s*[.!?])?$/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(where are we|what'?s happening|what (?:are you|is it) doing|what'?s it doing|how (?:is|are) (?:it|you|that|this) going|how'?s it going|are you still working|is it done|did it finish)(\b|[.!?])/,
] as const;

const FOLLOWUP_CONTROL_PATTERNS = [
  /^(after that|when you'?re done|when it'?s done|next|then|also|one more thing|follow up)(\b|[,.!?])/,
] as const;

const STEER_CONTROL_PATTERNS = [
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?update\s+\S/,
  /^(?:actually|instead|change|switch|focus|use|try|prefer|make|do|check|look at|go with|redirect|steer|tell it to)\b/,
  /^(?:can|could|would)\s+you\s+(?:actually\s+)?(?:change|switch|focus|use|try|prefer|make|do|check|look at|go with|redirect|steer)\b/,
  /\b(?:instead|not that|rather than|change that|switch to|focus on|use the|try the|go with|tell it to)\b/,
] as const;

const STOP_REDIRECT_CONTROL_PATTERNS = [
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?stop\s+(?:using|doing|checking|looking at|focusing on|trying)\b/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:can|could|would)\s+(?:you|we)\s+(?:please\s+)?stop\s+(?:using|doing|checking|looking at|focusing on|trying)\b/,
  /^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?stop\s+(?:that|this|it|the\s+(?:check|run|task|work))\s+from\b/,
] as const;

function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasNegatedCancelIntent(text: string): boolean {
  return (
    /\b(?:don'?t|do\s+not|not|never)\s+(?:please\s+)?(?:cancel|cancle|stop|abort|kill|end)\b/.test(
      text,
    ) || /\bstop\s+(?:it|that|this)\s+from\b/.test(text)
  );
}

/** Classify raw spoken control text with conservative auto-control gating. */
export function resolveRealtimeVoiceAgentControlIntent(params: {
  text: string;
  mode?: unknown;
}): RealtimeVoiceAgentControlIntent {
  const explicitMode = normalizeRealtimeVoiceAgentControlMode(params.mode);
  if (explicitMode) {
    return {
      mode: explicitMode,
      confidence: "high",
      reason: "explicit_mode",
      shouldAutoControl: true,
    };
  }

  const text = params.text;
  const normalized = text.trim().toLowerCase();
  // "Stop using X" redirects the active work; it must not be treated as an
  // abort of the whole run just because it starts with "stop".
  if (matchesAnyPattern(normalized, STOP_REDIRECT_CONTROL_PATTERNS)) {
    return {
      mode: "steer",
      confidence: "medium",
      reason: "steer_command",
      shouldAutoControl: true,
    };
  }
  if (
    !hasNegatedCancelIntent(normalized) &&
    matchesAnyPattern(normalized, CANCEL_CONTROL_PATTERNS)
  ) {
    return {
      mode: "cancel",
      confidence: "high",
      reason: "cancel_safety",
      shouldAutoControl: true,
    };
  }
  if (matchesAnyPattern(normalized, STATUS_CONTROL_PATTERNS)) {
    return {
      mode: "status",
      confidence: "high",
      reason: "status_query",
      shouldAutoControl: true,
    };
  }
  if (matchesAnyPattern(normalized, FOLLOWUP_CONTROL_PATTERNS)) {
    return {
      mode: "followup",
      confidence: "high",
      reason: "followup_marker",
      shouldAutoControl: true,
    };
  }
  if (matchesAnyPattern(normalized, STEER_CONTROL_PATTERNS)) {
    return {
      mode: "steer",
      confidence: "medium",
      reason: "steer_command",
      shouldAutoControl: true,
    };
  }
  return {
    mode: "status",
    confidence: "low",
    reason: "safe_default",
    shouldAutoControl: false,
  };
}

/** Return the best control mode for a spoken utterance, even if auto-routing is unsafe. */
export function classifyRealtimeVoiceAgentControlText(
  text: string,
): RealtimeVoiceAgentControlMode {
  return resolveRealtimeVoiceAgentControlIntent({ text }).mode;
}

/** Whether a spoken utterance is safe to route automatically to the control tool. */
export function shouldAutoControlRealtimeVoiceAgentText(text: string): boolean {
  return resolveRealtimeVoiceAgentControlIntent({ text }).shouldAutoControl;
}

/** Parse provider-owned control tool args from JSON strings or object payloads. */
export function parseRealtimeVoiceAgentControlToolArgs(args: unknown): {
  text: string;
  mode: RealtimeVoiceAgentControlMode;
} {
  const parsed = parseRealtimeVoiceAgentControlToolArgsRecord(args);
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const text =
    normalizeOptionalString((record as Record<string, unknown>).text) ??
    normalizeOptionalString((record as Record<string, unknown>).message) ??
    normalizeOptionalString((record as Record<string, unknown>).request) ??
    normalizeOptionalString((record as Record<string, unknown>).query);
  if (!text) {
    throw new Error("text required");
  }
  const mode =
    normalizeRealtimeVoiceAgentControlMode((record as Record<string, unknown>).mode) ??
    resolveRealtimeVoiceAgentControlIntent({ text }).mode;
  return { text, mode };
}

function parseRealtimeVoiceAgentControlToolArgsRecord(args: unknown): unknown {
  if (typeof args !== "string") {
    return args;
  }
  const trimmed = args.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { text: trimmed };
  }
}

/** Build the system-style instruction that forces exact spoken status output. */
export function buildRealtimeVoiceAgentControlSpeechMessage(text: string): string {
  return [
    "Internal voice control result.",
    "Do not call openclaw_agent_consult or any other tool for this message.",
    "Speak this exact status to the voice call, without adding, removing, or rephrasing words.",
    `Status: ${JSON.stringify(text)}`,
  ].join("\n");
}

/** Provider result payload used when the control tool cancels active work. */
export function buildRealtimeVoiceAgentCancelProviderResult(
  message = "Cancelled the active run.",
): RealtimeVoiceAgentControlProviderResult {
  return {
    status: "cancelled",
    message,
  };
}

/** Wrap follow-up text so an active run treats it as deferred context. */
export function buildRealtimeVoiceAgentFollowupSteeringText(text: string): string {
  return [
    "Spoken follow-up for the current voice call.",
    "If you are mid-task, incorporate this after the current step or result unless it directly changes the current task.",
    "",
    text,
  ].join("\n");
}

/** User-facing message for queue failures while steering or adding follow-up work. */
export function formatRealtimeVoiceAgentQueueRejection(
  mode: RealtimeVoiceAgentControlMode,
  reason: string,
): string {
  if (reason === "compacting") {
    return "The active run is compacting and cannot accept voice steering yet.";
  }
  if (reason === "not_streaming") {
    return "There is an active run, but it is not currently accepting steering.";
  }
  return mode === "followup"
    ? "Could not queue that follow-up."
    : "Could not steer the active run.";
}

function isRealtimeVoiceAgentControlToolEvent(event: TalkEvent): boolean {
  if (!event.type.startsWith("tool.")) {
    return false;
  }
  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : {};
  return normalizeOptionalString(payload.name) === REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME;
}

/** Format a concise spoken status for the active or most recent voice run. */
export function formatRealtimeVoiceAgentStatus(params: {
  active: boolean;
  recentEvents?: readonly TalkEvent[];
  activity?: RealtimeVoiceAgentRunActivity;
}): string {
  const recent = [...(params.recentEvents ?? [])].reverse();
  if (!params.active) {
    const turnEnded = recent.find((event) => event.type === "turn.ended");
    return turnEnded
      ? "Finished the last voice request."
      : "I'm not working on an active request right now.";
  }

  const toolEvent = recent.find(
    (event) => event.type.startsWith("tool.") && !isRealtimeVoiceAgentControlToolEvent(event),
  );
  if (toolEvent) {
    const payload =
      toolEvent.payload && typeof toolEvent.payload === "object"
        ? (toolEvent.payload as Record<string, unknown>)
        : {};
    const name = normalizeOptionalString(payload.name);
    const phase = normalizeOptionalString(payload.phase);
    if (toolEvent.type === "tool.call") {
      return name ? `Starting ${name}.` : "Starting a tool.";
    }
    if (toolEvent.type === "tool.result") {
      return name ? `Finished ${name} and is continuing.` : "Finished a tool and is continuing.";
    }
    if (toolEvent.type === "tool.progress") {
      return name ? `Working in ${name}${phase ? ` (${phase})` : ""}.` : "Still working.";
    }
  }

  if (params.activity?.activeToolName) {
    return `Running ${params.activity.activeToolName}.`;
  }
  if (params.activity?.activeWorkKind === "model_call") {
    return "Waiting on the model.";
  }
  if (params.activity?.activeWorkKind === "embedded_run" || params.activity?.hasActiveEmbeddedRun) {
    return "Working on the current voice request.";
  }

  return "Working on the current voice request.";
}

// ============================================================================
// 运行时适配器：控制活动代理运行
// ============================================================================

/** 队列消息结果。 */
export type EmbeddedAgentQueueMessageOutcome = {
  queued: boolean;
  sessionId?: string;
  reason?: string;
  target?: "embedded_run" | "reply_run";
  enqueuedAtMs?: number;
  deliveredAtMs?: number;
};

/** 控制运行所需的可注入依赖。 */
export type RealtimeVoiceAgentControlDeps = {
  abortEmbeddedAgentRun: (sessionId: string) => boolean;
  queueEmbeddedAgentMessageWithOutcomeAsync: (
    sessionId: string,
    text: string,
    options?: { steeringMode?: "all"; debounceMs?: number },
  ) => Promise<EmbeddedAgentQueueMessageOutcome>;
  getDiagnosticSessionActivitySnapshot: (params: {
    sessionId?: string;
    sessionKey?: string;
  }) => RealtimeVoiceAgentRunActivity;
  resolveActiveEmbeddedRunSessionId: (sessionKey: string) => string | undefined;
};

/** Apply a spoken status, cancel, steer, or follow-up request to an active run. */
export async function controlRealtimeVoiceAgentRun(
  params: {
    sessionKey: string;
    text: string;
    mode?: unknown;
    recentEvents?: readonly TalkEvent[];
  },
  deps: RealtimeVoiceAgentControlDeps,
): Promise<RealtimeVoiceAgentControlResult> {
  const sessionKey = params.sessionKey.trim();
  const text = params.text.trim();
  const intent = resolveRealtimeVoiceAgentControlIntent({ text, mode: params.mode });
  const mode = intent.mode;
  const sessionId = deps.resolveActiveEmbeddedRunSessionId(sessionKey);
  const activity = deps.getDiagnosticSessionActivitySnapshot({ sessionId, sessionKey });
  const active = Boolean(sessionId || activity.activeWorkKind || activity.hasActiveEmbeddedRun);

  // Status is read-only and can answer from diagnostic activity even when the
  // active embedded run id has already disappeared.
  if (mode === "status") {
    return {
      ok: true,
      mode,
      sessionKey,
      ...(sessionId ? { sessionId } : {}),
      active,
      message: formatRealtimeVoiceAgentStatus({
        active,
        recentEvents: params.recentEvents,
        activity,
      }),
      speak: true,
      show: true,
      suppress: false,
    };
  }

  // Cancellation requires a concrete embedded-run id; activity-only snapshots
  // are not abortable and should return an explicit no-active-run response.
  if (mode === "cancel") {
    if (!sessionId) {
      return {
        ok: false,
        mode,
        sessionKey,
        active: false,
        aborted: false,
        reason: "no_active_run",
        message: "There is no active run to cancel.",
        speak: true,
        show: true,
        suppress: false,
      };
    }
    const aborted = deps.abortEmbeddedAgentRun(sessionId);
    const message = aborted ? "Cancelled the active run." : "Could not cancel the active run.";
    return {
      ok: aborted,
      mode,
      sessionKey,
      sessionId,
      active: true,
      aborted,
      ...(aborted ? {} : { reason: "abort_rejected" }),
      message,
      speak: true,
      show: true,
      suppress: false,
      ...(aborted ? { providerResult: buildRealtimeVoiceAgentCancelProviderResult(message) } : {}),
    };
  }

  if (!sessionId) {
    return {
      ok: false,
      mode,
      sessionKey,
      active: false,
      queued: false,
      reason: "no_active_run",
      message: "There is no active run to steer.",
      speak: true,
      show: true,
      suppress: false,
    };
  }

  // Steering and follow-up both enqueue to the active run; follow-up is wrapped
  // so the runner treats it as deferred context instead of an immediate pivot.
  const steerText = mode === "followup" ? buildRealtimeVoiceAgentFollowupSteeringText(text) : text;
  const outcome = await deps.queueEmbeddedAgentMessageWithOutcomeAsync(sessionId, steerText, {
    steeringMode: "all",
    debounceMs: 0,
  });
  if (!outcome.queued) {
    return {
      ok: false,
      mode,
      sessionKey,
      sessionId: outcome.sessionId,
      active: true,
      queued: false,
      reason: outcome.reason,
      message: formatRealtimeVoiceAgentQueueRejection(mode, outcome.reason ?? ""),
      speak: true,
      show: true,
      suppress: false,
    };
  }

  return {
    ok: true,
    mode,
    sessionKey,
    sessionId: outcome.sessionId,
    active: true,
    queued: true,
    target: outcome.target,
    message:
      mode === "followup"
        ? "Queued that follow-up for the active run."
        : "Got it. I steered the active run.",
    speak: true,
    show: true,
    suppress: false,
    ...(outcome.enqueuedAtMs !== undefined ? { enqueuedAtMs: outcome.enqueuedAtMs } : {}),
    ...(outcome.deliveredAtMs !== undefined ? { deliveredAtMs: outcome.deliveredAtMs } : {}),
  };
}
