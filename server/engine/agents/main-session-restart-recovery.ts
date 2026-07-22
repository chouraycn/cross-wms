/**
 * 移植自 openclaw/src/agents/main-session-restart-recovery.ts
 *
 * Post-restart recovery for main sessions.
 * Simplified for cross-wms: no gateway session store, no transcript readers,
 * no gateway calls. Provides safe no-op defaults and basic session marking.
 */

/** Mark restart-aborted main sessions for recovery. */
export async function markRestartAbortedMainSessions(_params?: {
  sessionKeys?: Iterable<string>;
  sessionIds?: Iterable<string>;
  reason?: string;
}): Promise<{ marked: number; skipped: number }> {
  // Simplified: no session store access in cross-wms
  return { marked: 0, skipped: 0 };
}

/** Mark startup-orphaned main sessions for recovery. */
export async function markStartupOrphanedMainSessionsForRecovery(_params?: {
  activeSessionIds?: Iterable<string>;
  activeSessionKeys?: Iterable<string>;
  updatedBeforeMs?: number;
}): Promise<{ marked: number; skipped: number }> {
  return { marked: 0, skipped: 0 };
}

/** Mark sessions from stale transcript locks. */
export async function markRestartAbortedMainSessionsFromLocks(_params: {
  sessionsDir: string;
  cleanedLocks: Array<{ lockPath: string }>;
}): Promise<{ marked: number; skipped: number }> {
  return { marked: 0, skipped: 0 };
}

/** Recover restart-aborted main sessions. */
export async function recoverRestartAbortedMainSessions(_params?: {
  resumedSessionKeys?: Set<string>;
  activeSessionIds?: Iterable<string>;
  activeSessionKeys?: Iterable<string>;
}): Promise<{ recovered: number; failed: number; skipped: number }> {
  return { recovered: 0, failed: 0, skipped: 0 };
}

/** Recover startup-orphaned main sessions. */
export async function recoverStartupOrphanedMainSessions(_params?: {
  activeSessionIds?: Iterable<string>;
  activeSessionKeys?: Iterable<string>;
  updatedBeforeMs?: number;
  resumedSessionKeys?: Set<string>;
}): Promise<{ marked: number; recovered: number; failed: number; skipped: number }> {
  return { marked: 0, recovered: 0, failed: 0, skipped: 0 };
}

/** Schedule restart-aborted main session recovery with retries. */
export function scheduleRestartAbortedMainSessionRecovery(
  _params: {
    delayMs?: number;
    maxRetries?: number;
  } = {},
): void {
  // Simplified: no scheduling in cross-wms
}
