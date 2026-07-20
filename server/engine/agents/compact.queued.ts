/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compact.queued.ts
 *
 * Queued compaction for embedded agent sessions.
 * In cross-wms the compaction infrastructure is not available,
 * so compactEmbeddedAgentSession is a no-op that returns undefined.
 */

/** Compact an embedded agent session (no-op in cross-wms). */
export function compactEmbeddedAgentSession(..._args: unknown[]): undefined {
  return undefined;
}
