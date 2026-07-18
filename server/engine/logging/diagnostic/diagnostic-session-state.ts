import type { SessionStateDiagnostic } from '../types.js';

type SessionRef = {
  sessionId?: string;
  sessionKey?: string;
};

type SessionStateValue = 'idle' | 'processing' | 'waiting' | 'closed' | 'stuck';

function mapSessionState(state: SessionStateValue): SessionStateDiagnostic['state'] {
  switch (state) {
    case 'processing':
    case 'waiting':
      return 'active';
    case 'idle':
      return 'idle';
    case 'stuck':
      return 'stuck';
    case 'closed':
      return 'closed';
    default:
      return 'idle';
  }
}

type SessionStateEntry = {
  sessionId?: string;
  sessionKey?: string;
  state: SessionStateValue;
  lastActivity: number;
  queueDepth: number;
  generation: number;
  messageCount: number;
  startedAt: number;
};

const sessionStates = new Map<string, SessionStateEntry>();

function sessionKey(ref: SessionRef): string {
  return ref.sessionKey ?? ref.sessionId ?? 'unknown';
}

export function getDiagnosticSessionState(ref: SessionRef): SessionStateEntry {
  const key = sessionKey(ref);
  let entry = sessionStates.get(key);
  if (!entry) {
    entry = {
      sessionId: ref.sessionId,
      sessionKey: ref.sessionKey,
      state: 'idle',
      lastActivity: Date.now(),
      queueDepth: 0,
      generation: 0,
      messageCount: 0,
      startedAt: Date.now(),
    };
    sessionStates.set(key, entry);
  }
  return entry;
}

export function updateSessionState(
  ref: SessionRef,
  state: SessionStateValue,
  reason?: string,
): void {
  const entry = getDiagnosticSessionState(ref);
  entry.state = state;
  entry.lastActivity = Date.now();
  entry.generation++;
}

export function incrementSessionQueue(ref: SessionRef): void {
  const entry = getDiagnosticSessionState(ref);
  entry.queueDepth++;
  entry.lastActivity = Date.now();
  entry.generation++;
}

export function decrementSessionQueue(ref: SessionRef): void {
  const entry = getDiagnosticSessionState(ref);
  entry.queueDepth = Math.max(0, entry.queueDepth - 1);
  entry.lastActivity = Date.now();
  entry.generation++;
}

export function incrementMessageCount(ref: SessionRef): void {
  const entry = getDiagnosticSessionState(ref);
  entry.messageCount++;
  entry.lastActivity = Date.now();
}

export function markSessionProgress(ref: SessionRef): void {
  const entry = getDiagnosticSessionState(ref);
  entry.lastActivity = Date.now();
  entry.generation++;
}

export function pruneDiagnosticSessionStates(now: number = Date.now(), maxAgeMs: number = 3600000): void {
  for (const [key, entry] of sessionStates) {
    if (entry.state === 'closed' || now - entry.lastActivity > maxAgeMs) {
      sessionStates.delete(key);
    }
  }
}

export function getDiagnosticSessionStateCount(): number {
  return sessionStates.size;
}

export function getSessionStateDiagnostics(): SessionStateDiagnostic[] {
  const now = Date.now();
  return Array.from(sessionStates.values()).map((entry) => ({
    sessionId: entry.sessionKey ?? entry.sessionId ?? 'unknown',
    state: mapSessionState(entry.state),
    lastActivity: new Date(entry.lastActivity).toISOString(),
    durationMs: now - entry.startedAt,
    messageCount: entry.messageCount,
  }));
}

export function resetDiagnosticSessionStateForTest(): void {
  sessionStates.clear();
}
