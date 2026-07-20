/**
 * 移植自 openclaw/src/agents/command/cli-compaction.ts
 *
 * CLI turn compaction lifecycle. cross-wms provides a no-op implementation
 * that returns the session entry unchanged, since the full compaction
 * infrastructure (session managers, context engines, harness plugins) is
 * not available.
 */

/** Overrides CLI compaction dependencies for focused tests — no-op in cross-wms. */
export function setCliCompactionTestDeps(_overrides?: Record<string, unknown>): void {
  // No-op: cross-wms does not have the full compaction dependency graph.
}

/** Restores production CLI compaction dependencies after tests — no-op in cross-wms. */
export function resetCliCompactionTestDeps(): void {
  // No-op: cross-wms does not have the full compaction dependency graph.
}

/**
 * Runs pre-turn compaction for a CLI session and returns the updated session entry.
 * In cross-wms this returns the session entry unchanged since the compaction
 * infrastructure is not available.
 */
export async function runCliTurnCompactionLifecycle(params: {
  sessionEntry?: unknown;
  [key: string]: unknown;
}): Promise<unknown> {
  // cross-wms lacks context engines, harness plugins, session managers, etc.
  // Return the session entry unchanged.
  return (params as { sessionEntry?: unknown }).sessionEntry;
}
