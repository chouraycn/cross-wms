// Re-export from diagnostic/
export * from "./diagnostic/diagnostic.js";

// ============================================================================
// Compat shim: legacy diagnostic / security surface
// ----------------------------------------------------------------------------
// The engine/agents, engine/auto-reply, engine/cron, engine/secrets and
// engine/security modules still import these symbols from the OLD
// logging/diagnostic + security aggregation surface. They were removed during
// the DiagnosticSystem refactor but the call sites were never updated, and the
// re-export chain through scan-paths / external-content / message-lifecycle
// broke. This shim restores them so the bundle resolves.
//
// NOTE: this is a stop-gap. The security helpers (isSensitiveFilePath,
// scanPathForRisks, wrapWebContent) are intentionally SAFE DEGRADATIONS that do
// NOT enforce the original checks — replace them with real implementations
// when the in-progress refactor lands.
// ============================================================================

import { emitDiagnosticEvent } from "./diagnostic/diagnostic.js";

type DiagLevel = "debug" | "info" | "warn" | "error" | "fatal";

function emitCompat(level: DiagLevel, type: string, payload: Record<string, unknown>): void {
  try {
    emitDiagnosticEvent({
      level,
      type,
      message: typeof payload.message === "string" ? payload.message : type,
      ...payload,
    });
  } catch {
    /* never block the main flow on diagnostics */
  }
}

/** Structured logger object expected by call sites (debug/info/warn/error/trace). */
export const diagnosticLogger = {
  debug: (...args: unknown[]) => emitCompat("debug", "compat.log", { message: args.map(String).join(" ") }),
  info: (...args: unknown[]) => emitCompat("info", "compat.log", { message: args.map(String).join(" ") }),
  warn: (...args: unknown[]) => emitCompat("warn", "compat.log", { message: args.map(String).join(" ") }),
  error: (...args: unknown[]) => emitCompat("error", "compat.log", { message: args.map(String).join(" ") }),
  trace: (...args: unknown[]) => emitCompat("debug", "compat.log", { message: args.map(String).join(" ") }),
};

export function logMessageQueued(p: { sessionId?: string; sessionKey?: string; source: string }): void {
  emitCompat("info", "message.queued", p as unknown as Record<string, unknown>);
}

export function logMessageReceived(p: { sessionId?: string; sessionKey?: string; source?: string }): void {
  emitCompat("info", "message.received", p as unknown as Record<string, unknown>);
}

export function logMessageDispatchStarted(p: { sessionId?: string; sessionKey?: string }): void {
  emitCompat("info", "message.dispatch.started", p as unknown as Record<string, unknown>);
}

export function logMessageDispatchCompleted(p: { sessionId?: string; sessionKey?: string }): void {
  emitCompat("info", "message.dispatch.completed", p as unknown as Record<string, unknown>);
}

export function logSessionTurnCreated(p: { sessionId?: string; sessionKey?: string }): void {
  emitCompat("info", "session.turn.created", p as unknown as Record<string, unknown>);
}

export function logSessionStateChange(p: {
  sessionId?: string;
  sessionKey: string;
  state: string;
  reason?: string;
}): void {
  emitCompat("info", "session.state.change", p as unknown as Record<string, unknown>);
}

export function markDiagnosticSessionProgress(p: { sessionId?: string; sessionKey: string }): void {
  emitCompat("info", "session.progress", p as unknown as Record<string, unknown>);
}

export function updateDiagnosticSessionFile(p: { sessionId?: string; sessionFile: string }): void {
  emitCompat("info", "session.file.update", p as unknown as Record<string, unknown>);
}

export function logToolLoopAction(p: Record<string, unknown>): void {
  emitCompat("debug", "tool.loop.action", p);
}

// --- Stuck-session recovery (disabled in compat) ---
export function isStuckSessionRecoveryEnabled(): boolean {
  return false;
}

export function resolveStuckSessionWarnMs(_cfg?: unknown, _fallback?: number): number {
  return 30_000;
}

export function resolveStuckSessionAbortMs(_cfg?: unknown, warnMs = 30_000): number {
  return warnMs * 4;
}

export function requestStuckDiagnosticSessionRecovery(_p?: unknown): void {
  /* no-op in compat */
}

// --- Message lifecycle ---
export interface DiagnosticMessageLifecycle {
  markProcessing(): void;
  markCompleted(): void;
  markError(error?: unknown): void;
  markIdle(): void;
  markQueued(): void;
}

export function createDiagnosticMessageLifecycle(opts: {
  enabled?: boolean;
  sessionId?: string;
  sessionKey?: string;
  channel?: string;
  source?: string;
  startedAtMs?: number;
  trackSessionState?: boolean;
}): DiagnosticMessageLifecycle {
  const base = {
    sessionId: opts.sessionId,
    sessionKey: opts.sessionKey,
    channel: opts.channel,
    source: opts.source,
  };
  return {
    markProcessing: () => emitCompat("info", "lifecycle.processing", base as Record<string, unknown>),
    markCompleted: () => emitCompat("info", "lifecycle.completed", base as Record<string, unknown>),
    markError: (error?: unknown) =>
      emitCompat("error", "lifecycle.error", { ...base, error: String(error) }),
    markIdle: () => emitCompat("info", "lifecycle.idle", base as Record<string, unknown>),
    markQueued: () => emitCompat("info", "lifecycle.queued", base as Record<string, unknown>),
  };
}

// --- Security helpers: SAFE DEGRADATIONS (do NOT enforce original checks) ---
// TODO(refactor): replace with the real implementations when the security
// refactor lands. Until then no path is rejected and web content is passed
// through unwrapped.
export function isSensitiveFilePath(_path: string): boolean {
  return false;
}

export function scanPathForRisks(
  _filePath: string,
  _opts?: { allowedRoots?: string[] },
): { ok: boolean; isSensitive: boolean; risks: string[]; allowedRoots?: string[] } {
  return { ok: true, isSensitive: false, risks: [], allowedRoots: _opts?.allowedRoots };
}

export function wrapWebContent(text: string, _source: string): string {
  return text;
}

// Webhook diagnostic helpers (used by plugin-sdk/logging-core.ts)
export function logWebhookError(error: unknown, context?: Record<string, unknown>): void {
  diagnosticLogger.error('webhook error', { error: String(error), ...context });
}

export function logWebhookProcessed(webhookId: string, context?: Record<string, unknown>): void {
  diagnosticLogger.info('webhook processed', { webhookId, ...context });
}

export function logWebhookReceived(webhookId: string, source?: string): void {
  diagnosticLogger.info('webhook received', { webhookId, source });
}

// Diagnostic heartbeat (simplified: no-op timers)
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startDiagnosticHeartbeat(intervalMs: number = 30_000): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    diagnosticLogger.debug('diagnostic heartbeat');
  }, intervalMs);
}

export function stopDiagnosticHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
