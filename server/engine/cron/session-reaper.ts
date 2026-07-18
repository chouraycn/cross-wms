import { logger } from "../../logger.js";

const REAPER_INTERVAL_MS = 60000;
const MAX_IDLE_DURATION_MS = 24 * 60 * 60 * 1000;

interface SessionReaperState {
  activeSessions: Map<string, { lastUsedAtMs: number; sessionKey: string }>;
  intervalId?: NodeJS.Timeout;
  enabled: boolean;
}

const state: SessionReaperState = {
  activeSessions: new Map(),
  enabled: true,
};

export function startSessionReaper(): void {
  if (state.intervalId) {
    return;
  }

  state.intervalId = setInterval(() => {
    reapIdleSessions();
  }, REAPER_INTERVAL_MS);
}

export function stopSessionReaper(): void {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = undefined;
  }
}

export function registerSession(sessionKey: string): void {
  if (!state.enabled) {
    return;
  }
  state.activeSessions.set(sessionKey, {
    lastUsedAtMs: Date.now(),
    sessionKey,
  });
}

export function updateSessionActivity(sessionKey: string): void {
  const session = state.activeSessions.get(sessionKey);
  if (session) {
    session.lastUsedAtMs = Date.now();
  }
}

export function unregisterSession(sessionKey: string): void {
  state.activeSessions.delete(sessionKey);
}

function reapIdleSessions(): void {
  const now = Date.now();
  const idleSessionKeys: string[] = [];

  for (const [key, { lastUsedAtMs }] of state.activeSessions) {
    if (now - lastUsedAtMs > MAX_IDLE_DURATION_MS) {
      idleSessionKeys.push(key);
    }
  }

  for (const key of idleSessionKeys) {
    state.activeSessions.delete(key);
    logger.info({ sessionKey: key }, "[cron-session-reaper] reaped idle session");
  }
}

export function getActiveSessionCount(): number {
  return state.activeSessions.size;
}

export function enableSessionReaper(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    state.activeSessions.clear();
  }
}