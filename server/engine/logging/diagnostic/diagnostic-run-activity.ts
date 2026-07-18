type RunActivitySnapshot = {
  activeWorkKind?: string;
  lastProgressReason?: string;
  lastProgressAgeMs?: number;
  activeToolName?: string;
  activeToolCallId?: string;
  activeToolAgeMs?: number;
  hasActiveEmbeddedRun?: boolean;
  hasActiveModelCall?: boolean;
  hasActiveToolCall?: boolean;
};

type RunActivityState = {
  sessions: Map<string, RunActivitySnapshot>;
};

const state: RunActivityState = {
  sessions: new Map(),
};

function sessionKey(ref: { sessionId?: string; sessionKey?: string }): string {
  return ref.sessionKey ?? ref.sessionId ?? 'unknown';
}

export function getDiagnosticRunActivitySnapshot(
  ref: { sessionId?: string; sessionKey?: string },
  now: number = Date.now(),
): RunActivitySnapshot {
  const key = sessionKey(ref);
  const snapshot = state.sessions.get(key);
  if (!snapshot) {
    return {};
  }
  return { ...snapshot };
}

export function updateRunActivity(
  ref: { sessionId?: string; sessionKey?: string },
  updates: Partial<RunActivitySnapshot>,
): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, { ...existing, ...updates });
}

export function markRunProgress(
  ref: { sessionId?: string; sessionKey?: string },
  reason: string,
): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    lastProgressReason: reason,
    lastProgressAgeMs: 0,
  });
}

export function startToolCall(
  ref: { sessionId?: string; sessionKey?: string },
  toolName: string,
  toolCallId?: string,
): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    activeToolName: toolName,
    activeToolCallId: toolCallId,
    activeToolAgeMs: 0,
    hasActiveToolCall: true,
    activeWorkKind: 'tool_call',
  });
}

export function endToolCall(ref: { sessionId?: string; sessionKey?: string }): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    activeToolName: undefined,
    activeToolCallId: undefined,
    activeToolAgeMs: undefined,
    hasActiveToolCall: false,
  });
}

export function startEmbeddedRun(ref: { sessionId?: string; sessionKey?: string }): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    hasActiveEmbeddedRun: true,
    activeWorkKind: 'embedded_run',
  });
}

export function endEmbeddedRun(ref: { sessionId?: string; sessionKey?: string }): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    hasActiveEmbeddedRun: false,
  });
}

export function startModelCall(ref: { sessionId?: string; sessionKey?: string }): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    hasActiveModelCall: true,
    activeWorkKind: 'model_call',
  });
}

export function endModelCall(ref: { sessionId?: string; sessionKey?: string }): void {
  const key = sessionKey(ref);
  const existing = state.sessions.get(key) ?? {};
  state.sessions.set(key, {
    ...existing,
    hasActiveModelCall: false,
  });
}

export function pruneRunActivity(now: number = Date.now(), maxAgeMs: number = 3600000): void {
  for (const [key, snapshot] of state.sessions) {
    if (snapshot.lastProgressAgeMs !== undefined && snapshot.lastProgressAgeMs > maxAgeMs) {
      state.sessions.delete(key);
    }
  }
}

export function resetDiagnosticRunActivityForTest(): void {
  state.sessions.clear();
}
