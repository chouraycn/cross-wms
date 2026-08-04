/**
 * Embedded Agent Runs Hooks — leaf registry to break the
 * runs.ts → diagnostic.ts → diagnostic-stuck-session-recovery.runtime.ts → runs.ts cycle (#10).
 *
 * recovery.runtime.ts is lazily loaded by diagnostic.ts (dynamic import) and calls
 * into runs.ts to abort/query active embedded runs. By routing those calls through
 * this leaf registry instead of a static import of runs.ts, the static edge
 * recovery.runtime.ts → runs.ts is removed; the remaining dynamic edge
 * diagnostic.ts → recovery.runtime.ts no longer forms a cycle.
 *
 * Loading order is safe: runs.ts statically imports diagnostic.ts (runs.ts body
 * runs after diagnostic.ts finishes loading) and registers these hooks at module
 * top-level. recovery.runtime.ts is only loaded at runtime (lazy dynamic import),
 * long after runs.ts has registered.
 */

export type AbortAndDrainEmbeddedAgentRunResult = {
  aborted: boolean;
  drained: boolean;
  forceCleared: boolean;
};

export interface EmbeddedAgentRunsHooks {
  isEmbeddedAgentRunActive: (sessionId: string) => boolean;
  isEmbeddedAgentRunHandleActive: (sessionId: string) => boolean;
  resolveActiveEmbeddedRunHandleSessionId: (sessionKey: string) => string | undefined;
  resolveActiveEmbeddedRunHandleSessionIdBySessionFile: (sessionFile: string) => string | undefined;
  resolveActiveEmbeddedRunSessionIdBySessionFile: (sessionFile: string) => string | undefined;
  resolveActiveEmbeddedRunSessionId: (sessionKey: string) => string | undefined;
  abortAndDrainEmbeddedAgentRun: (params: {
    sessionId: string;
    sessionKey?: string;
    settleMs?: number;
    forceClear?: boolean;
    reason?: string;
  }) => Promise<AbortAndDrainEmbeddedAgentRunResult>;
}

let registeredHooks: EmbeddedAgentRunsHooks | null = null;

export function registerEmbeddedAgentRunsHooks(hooks: EmbeddedAgentRunsHooks): void {
  registeredHooks = hooks;
}

function requireHooks(): EmbeddedAgentRunsHooks {
  if (!registeredHooks) {
    throw new Error('embedded agent runs hooks not registered yet (runs.ts not loaded)');
  }
  return registeredHooks;
}

export function isEmbeddedAgentRunActive(sessionId: string): boolean {
  return requireHooks().isEmbeddedAgentRunActive(sessionId);
}

export function isEmbeddedAgentRunHandleActive(sessionId: string): boolean {
  return requireHooks().isEmbeddedAgentRunHandleActive(sessionId);
}

export function resolveActiveEmbeddedRunHandleSessionId(sessionKey: string): string | undefined {
  return requireHooks().resolveActiveEmbeddedRunHandleSessionId(sessionKey);
}

export function resolveActiveEmbeddedRunHandleSessionIdBySessionFile(
  sessionFile: string,
): string | undefined {
  return requireHooks().resolveActiveEmbeddedRunHandleSessionIdBySessionFile(sessionFile);
}

export function resolveActiveEmbeddedRunSessionIdBySessionFile(
  sessionFile: string,
): string | undefined {
  return requireHooks().resolveActiveEmbeddedRunSessionIdBySessionFile(sessionFile);
}

export function resolveActiveEmbeddedRunSessionId(sessionKey: string): string | undefined {
  return requireHooks().resolveActiveEmbeddedRunSessionId(sessionKey);
}

export function abortAndDrainEmbeddedAgentRun(params: {
  sessionId: string;
  sessionKey?: string;
  settleMs?: number;
  forceClear?: boolean;
  reason?: string;
}): Promise<AbortAndDrainEmbeddedAgentRunResult> {
  return requireHooks().abortAndDrainEmbeddedAgentRun(params);
}
