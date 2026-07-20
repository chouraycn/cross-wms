/**
 * Ported from openclaw/src/agents/subagent-session-cleanup.ts
 *
 * Subagent session cleanup after run completion.
 * Cross-wms degradation: no-op without session file management.
 */

/** Deletes subagent session data for cleanup. */
export async function deleteSubagentSessionForCleanup(..._args: unknown[]): Promise<void> {
  // Cross-wms does not have subagent session file management.
}
