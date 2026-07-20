/**
 * Ported from openclaw/src/agents/embedded-agent-runner/session-manager-init.ts
 *
 * Prepares session managers and transcript state before embedded runs.
 * Cross-wms degradation: simplified without JSONL/file session management.
 */

/** Prepares a session manager for an embedded run. */
export async function prepareSessionManagerForRun(params: {
  sessionManager: unknown;
  sessionFile: string;
  hadSessionFile: boolean;
  sessionId: string;
  cwd: string;
}): Promise<void> {
  // Cross-wms does not have the full SessionManager with fileEntries/flushed state.
  // No-op: callers should handle session persistence externally.
}
