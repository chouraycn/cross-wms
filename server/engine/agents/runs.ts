/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/runs.ts
 *
 * cross-wms 降级实现：使用内存 Map 管理嵌入式代理运行句柄。
 * 不依赖 reply-run-registry、diagnostic 等完整 OpenClaw 基础设施。
 */

// ---- In-memory run state ----
const ACTIVE_EMBEDDED_RUNS = new Map<string, { abort: (reason?: string) => void; isStreaming: () => boolean; isCompacting: () => boolean; queueMessage: (text: string, options?: unknown) => Promise<void>; supportsTranscriptCommitWait?: boolean; sourceReplyDeliveryMode?: string }>();
const ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY = new Map<string, string>();
const ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE = new Map<string, string>();
const ACTIVE_EMBEDDED_RUN_SNAPSHOTS = new Map<string, unknown>();
const ABANDONED_EMBEDDED_RUNS = new Map<string, { sessionId: string; sessionKey?: string; sessionFile?: string; abandonedAtMs: number; reason: string }>();
const ABANDONED_SESSION_IDS_BY_KEY = new Map<string, string>();
const ABANDONED_SESSION_IDS_BY_FILE = new Map<string, string>();
const EMBEDDED_RUN_WAITERS = new Map<string, Set<{ resolve: (value: boolean) => void; timer: NodeJS.Timeout }>>();

function resolveSessionFileKey(sessionFile: string): string {
  return sessionFile.trim().replace(/\\/g, "/").toLowerCase();
}

export type EmbeddedAgentQueueFailureReason =
  | "no_active_run"
  | "not_streaming"
  | "compacting"
  | "source_reply_delivery_mode_mismatch"
  | "transcript_commit_wait_unsupported"
  | "runtime_rejected";

export type EmbeddedAgentQueueMessageOutcome =
  | {
      queued: true;
      sessionId: string;
      target: "embedded_run" | "reply_run";
      gatewayHealth: "live";
      deliveredAtMs?: number;
      enqueuedAtMs?: number;
    }
  | {
      queued: false;
      sessionId: string;
      reason: EmbeddedAgentQueueFailureReason;
      gatewayHealth: "live";
      errorMessage?: string;
    };

export type AbortAndDrainEmbeddedAgentRunResult = {
  aborted: boolean;
  drained: boolean;
  forceCleared: boolean;
};

export function formatEmbeddedAgentQueueFailureSummary(
  outcome: EmbeddedAgentQueueMessageOutcome,
): string | undefined {
  if (outcome.queued) {
    return undefined;
  }
  const errorPart = outcome.errorMessage ? ` error=${outcome.errorMessage}` : "";
  return `queue_message_failed reason=${outcome.reason} sessionId=${outcome.sessionId} gatewayHealth=${outcome.gatewayHealth}${errorPart}`;
}

export function clearEmbeddedRunAbandonment(params: {
  sessionId?: string;
  sessionKey?: string;
  sessionFile?: string;
}): void {
  const normalizedSessionId = params.sessionId?.trim();
  if (normalizedSessionId) {
    const abandoned = ABANDONED_EMBEDDED_RUNS.get(normalizedSessionId);
    if (abandoned) {
      ABANDONED_EMBEDDED_RUNS.delete(normalizedSessionId);
      if (abandoned.sessionKey && ABANDONED_SESSION_IDS_BY_KEY.get(abandoned.sessionKey) === normalizedSessionId) {
        ABANDONED_SESSION_IDS_BY_KEY.delete(abandoned.sessionKey);
      }
      if (abandoned.sessionFile) {
        const key = resolveSessionFileKey(abandoned.sessionFile);
        if (ABANDONED_SESSION_IDS_BY_FILE.get(key) === normalizedSessionId) {
          ABANDONED_SESSION_IDS_BY_FILE.delete(key);
        }
      }
    }
  }
  const normalizedSessionKey = params.sessionKey?.trim();
  if (normalizedSessionKey) {
    const sid = ABANDONED_SESSION_IDS_BY_KEY.get(normalizedSessionKey);
    if (sid) {
      ABANDONED_EMBEDDED_RUNS.delete(sid);
      ABANDONED_SESSION_IDS_BY_KEY.delete(normalizedSessionKey);
    }
  }
  const normalizedSessionFile = params.sessionFile?.trim();
  if (normalizedSessionFile) {
    const key = resolveSessionFileKey(normalizedSessionFile);
    const sid = ABANDONED_SESSION_IDS_BY_FILE.get(key);
    if (sid) {
      ABANDONED_EMBEDDED_RUNS.delete(sid);
      ABANDONED_SESSION_IDS_BY_FILE.delete(key);
    }
  }
}

export function markEmbeddedRunAbandoned(params: {
  sessionId: string;
  sessionKey?: string;
  sessionFile?: string;
  reason: string;
}): void {
  const sessionId = params.sessionId.trim();
  if (!sessionId) {
    return;
  }
  clearEmbeddedRunAbandonment({ sessionId, sessionKey: params.sessionKey, sessionFile: params.sessionFile });
  const entry = {
    sessionId,
    abandonedAtMs: Date.now(),
    reason: params.reason,
    ...(params.sessionKey?.trim() ? { sessionKey: params.sessionKey.trim() } : {}),
    ...(params.sessionFile?.trim() ? { sessionFile: params.sessionFile.trim() } : {}),
  };
  ABANDONED_EMBEDDED_RUNS.set(sessionId, entry);
  if (entry.sessionKey) {
    ABANDONED_SESSION_IDS_BY_KEY.set(entry.sessionKey, sessionId);
  }
  if (entry.sessionFile) {
    ABANDONED_SESSION_IDS_BY_FILE.set(resolveSessionFileKey(entry.sessionFile), sessionId);
  }
}

export function markActiveEmbeddedRunAbandoned(params: {
  sessionId: string;
  handle: unknown;
  sessionKey?: string;
  sessionFile?: string;
  reason: string;
}): boolean {
  const sessionId = params.sessionId.trim();
  if (!sessionId || ACTIVE_EMBEDDED_RUNS.get(sessionId) !== params.handle) {
    return false;
  }
  markEmbeddedRunAbandoned(params as Parameters<typeof markEmbeddedRunAbandoned>[0]);
  return true;
}

export function isEmbeddedRunAbandoned(params: {
  sessionId?: string;
  sessionKey?: string;
  sessionFile?: string;
}): boolean {
  const normalizedSessionId = params.sessionId?.trim();
  if (normalizedSessionId && ABANDONED_EMBEDDED_RUNS.has(normalizedSessionId)) {
    return true;
  }
  const normalizedSessionKey = params.sessionKey?.trim();
  if (normalizedSessionKey && ABANDONED_SESSION_IDS_BY_KEY.has(normalizedSessionKey)) {
    return true;
  }
  const normalizedSessionFile = params.sessionFile?.trim();
  return Boolean(normalizedSessionFile && ABANDONED_SESSION_IDS_BY_FILE.has(resolveSessionFileKey(normalizedSessionFile)));
}

export function queueEmbeddedAgentMessage(
  sessionId: string,
  text: string,
  options?: unknown,
): boolean {
  return queueEmbeddedAgentMessageWithOutcome(sessionId, text, options).queued;
}

export function queueEmbeddedAgentMessageWithOutcome(
  sessionId: string,
  text: string,
  options?: unknown,
): EmbeddedAgentQueueMessageOutcome {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) {
    return { queued: false, sessionId, reason: "no_active_run", gatewayHealth: "live" };
  }
  if (!handle.isStreaming()) {
    return { queued: false, sessionId, reason: "not_streaming", gatewayHealth: "live" };
  }
  if (handle.isCompacting()) {
    return { queued: false, sessionId, reason: "compacting", gatewayHealth: "live" };
  }
  void handle.queueMessage(text, options).catch(() => {});
  return { queued: true, sessionId, target: "embedded_run", gatewayHealth: "live", enqueuedAtMs: Date.now() };
}

export async function queueEmbeddedAgentMessageWithOutcomeAsync(
  sessionId: string,
  text: string,
  options?: unknown,
): Promise<EmbeddedAgentQueueMessageOutcome> {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) {
    return { queued: false, sessionId, reason: "no_active_run", gatewayHealth: "live" };
  }
  if (!handle.isStreaming()) {
    return { queued: false, sessionId, reason: "not_streaming", gatewayHealth: "live" };
  }
  if (handle.isCompacting()) {
    return { queued: false, sessionId, reason: "compacting", gatewayHealth: "live" };
  }
  try {
    await handle.queueMessage(text, options);
    return { queued: true, sessionId, target: "embedded_run", gatewayHealth: "live", enqueuedAtMs: Date.now() };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { queued: false, sessionId, reason: "runtime_rejected", gatewayHealth: "live", errorMessage };
  }
}

export function abortEmbeddedAgentRun(sessionId: string): boolean;
export function abortEmbeddedAgentRun(
  sessionId: undefined,
  opts: { mode: "all" | "compacting"; reason?: "restart" },
): boolean;
export function abortEmbeddedAgentRun(
  sessionId?: string,
  opts?: { mode?: "all" | "compacting"; reason?: "restart" },
): boolean {
  if (typeof sessionId === "string" && sessionId.length > 0) {
    const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
    if (!handle) {
      return false;
    }
    try {
      handle.abort(opts?.reason);
    } catch {
      return false;
    }
    return true;
  }

  const mode = opts?.mode;
  let aborted = false;
  for (const [id, handle] of ACTIVE_EMBEDDED_RUNS) {
    const shouldAbort = mode === "all" || (mode === "compacting" && handle.isCompacting());
    if (!shouldAbort) {
      continue;
    }
    try {
      handle.abort(opts?.reason);
      aborted = true;
    } catch {
      // Continue aborting other runs
    }
  }
  return aborted;
}

export function isEmbeddedAgentRunActive(sessionId: string): boolean {
  return ACTIVE_EMBEDDED_RUNS.has(sessionId);
}

export function isEmbeddedAgentRunHandleActive(sessionId: string): boolean {
  return ACTIVE_EMBEDDED_RUNS.has(sessionId);
}

export function isEmbeddedAgentRunAbortableForCompaction(sessionId: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  return handle ? handle.isCompacting() : false;
}

export function isEmbeddedAgentRunStreaming(sessionId: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) {
    return false;
  }
  return handle.isStreaming();
}

export function resolveActiveEmbeddedRunHandleSessionId(sessionKey: string): string | undefined {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey) {
    return undefined;
  }
  return ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(normalizedSessionKey);
}

export function resolveActiveEmbeddedRunHandleSessionIdBySessionFile(
  sessionFile: string,
): string | undefined {
  const normalizedSessionFile = sessionFile.trim();
  if (!normalizedSessionFile) {
    return undefined;
  }
  return ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.get(resolveSessionFileKey(normalizedSessionFile));
}

export function resolveActiveEmbeddedRunSessionIdBySessionFile(
  sessionFile: string,
): string | undefined {
  return resolveActiveEmbeddedRunHandleSessionIdBySessionFile(sessionFile);
}

export function getActiveEmbeddedRunSnapshot(
  sessionId: string,
): unknown | undefined {
  return ACTIVE_EMBEDDED_RUN_SNAPSHOTS.get(sessionId);
}

export async function waitForActiveEmbeddedRuns(
  timeoutMs?: number,
  opts?: { pollMs?: number },
): Promise<{ drained: boolean }> {
  const pollMs = opts?.pollMs ?? 250;
  if (timeoutMs !== undefined && timeoutMs <= 0) {
    return { drained: ACTIVE_EMBEDDED_RUNS.size === 0 };
  }
  const maxWaitMs =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs)
      ? Math.max(pollMs, Math.floor(timeoutMs))
      : undefined;

  const startedAt = Date.now();
  while (true) {
    if (ACTIVE_EMBEDDED_RUNS.size === 0) {
      return { drained: true };
    }
    const elapsedMs = Date.now() - startedAt;
    if (maxWaitMs !== undefined && elapsedMs >= maxWaitMs) {
      return { drained: false };
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollMs);
    });
  }
}

export function waitForEmbeddedAgentRunEnd(
  sessionId: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  if (!sessionId) {
    return Promise.resolve(true);
  }
  if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const waiters = EMBEDDED_RUN_WAITERS.get(sessionId) ?? new Set();
    const waiter = {
      resolve,
      timer: setTimeout(() => {
        waiters.delete(waiter);
        if (waiters.size === 0) {
          EMBEDDED_RUN_WAITERS.delete(sessionId);
        }
        resolve(false);
      }, Math.max(100, timeoutMs)),
    };
    waiters.add(waiter);
    EMBEDDED_RUN_WAITERS.set(sessionId, waiters);
    if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
      waiters.delete(waiter);
      if (waiters.size === 0) {
        EMBEDDED_RUN_WAITERS.delete(sessionId);
      }
      clearTimeout(waiter.timer);
      resolve(true);
    }
  });
}

export async function abortAndDrainEmbeddedAgentRun(params: {
  sessionId: string;
  sessionKey?: string;
  settleMs?: number;
  forceClear?: boolean;
  reason?: string;
}): Promise<AbortAndDrainEmbeddedAgentRunResult> {
  const settleMs = params.settleMs ?? 15_000;
  const aborted = abortEmbeddedAgentRun(params.sessionId);
  const drained = aborted ? await waitForEmbeddedAgentRunEnd(params.sessionId, settleMs) : false;
  const forceCleared =
    params.forceClear === true && (!aborted || !drained)
      ? forceClearEmbeddedAgentRun(params.sessionId, params.sessionKey, params.reason)
      : false;
  return { aborted, drained, forceCleared };
}

function notifyEmbeddedRunEnded(sessionId: string) {
  const waiters = EMBEDDED_RUN_WAITERS.get(sessionId);
  if (!waiters || waiters.size === 0) {
    return;
  }
  EMBEDDED_RUN_WAITERS.delete(sessionId);
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(true);
  }
}

export function setActiveEmbeddedRun(
  sessionId: string,
  handle: Parameters<typeof ACTIVE_EMBEDDED_RUNS.set>[1],
  sessionKey?: string,
  sessionFile?: string,
) {
  clearEmbeddedRunAbandonment({ sessionId, sessionKey, sessionFile });
  ACTIVE_EMBEDDED_RUNS.set(sessionId, handle);
  if (sessionKey?.trim()) {
    ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.set(sessionKey.trim(), sessionId);
  }
  // Clear old file mapping for this sessionId
  for (const [key, sid] of ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE) {
    if (sid === sessionId) {
      ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(key);
    }
  }
  if (sessionFile?.trim()) {
    ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.set(resolveSessionFileKey(sessionFile), sessionId);
  }
}

export function updateActiveEmbeddedRunSnapshot(
  sessionId: string,
  snapshot: unknown,
) {
  if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
    return;
  }
  ACTIVE_EMBEDDED_RUN_SNAPSHOTS.set(sessionId, snapshot);
}

export function updateActiveEmbeddedRunSessionFile(
  sessionId: string,
  sessionFile: string | undefined,
): void {
  if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
    return;
  }
  // Clear old file mapping for this sessionId
  for (const [key, sid] of ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE) {
    if (sid === sessionId) {
      ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(key);
    }
  }
  if (sessionFile?.trim()) {
    ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.set(resolveSessionFileKey(sessionFile), sessionId);
  }
}

export function clearActiveEmbeddedRun(
  sessionId: string,
  handle: unknown,
  sessionKey?: string,
  sessionFile?: string,
) {
  const activeHandle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (activeHandle === undefined) {
    return;
  }
  if (activeHandle === handle) {
    ACTIVE_EMBEDDED_RUNS.delete(sessionId);
    ACTIVE_EMBEDDED_RUN_SNAPSHOTS.delete(sessionId);
    if (sessionKey?.trim()) {
      if (ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(sessionKey.trim()) === sessionId) {
        ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.delete(sessionKey.trim());
      }
    }
    for (const [key, sid] of [...ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE]) {
      if (sid === sessionId) {
        ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(key);
      }
    }
    notifyEmbeddedRunEnded(sessionId);
  }
}

export function forceClearEmbeddedAgentRun(
  sessionId: string,
  sessionKey?: string,
  reason = "stuck_recovery",
): boolean {
  let cleared = false;
  if (ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
    ACTIVE_EMBEDDED_RUNS.delete(sessionId);
    ACTIVE_EMBEDDED_RUN_SNAPSHOTS.delete(sessionId);
    if (sessionKey?.trim()) {
      if (ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(sessionKey.trim()) === sessionId) {
        ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.delete(sessionKey.trim());
      }
    }
    for (const [key, sid] of [...ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE]) {
      if (sid === sessionId) {
        ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(key);
      }
    }
    notifyEmbeddedRunEnded(sessionId);
    cleared = true;
  }
  return cleared;
}

export const testing_runs = {
  resetActiveEmbeddedRuns() {
    for (const waiters of EMBEDDED_RUN_WAITERS.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(true);
      }
    }
    EMBEDDED_RUN_WAITERS.clear();
    ACTIVE_EMBEDDED_RUNS.clear();
    ACTIVE_EMBEDDED_RUN_SNAPSHOTS.clear();
    ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.clear();
    ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.clear();
    ABANDONED_EMBEDDED_RUNS.clear();
    ABANDONED_SESSION_IDS_BY_KEY.clear();
    ABANDONED_SESSION_IDS_BY_FILE.clear();
  },
} as const;
