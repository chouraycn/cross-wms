/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt.abort-settle-timeout.ts
 *
 * Embedded abort settle timeout resolution.
 * Cross-wms degradation: returns default timeout without config resolution.
 */

/** Resolves the embedded abort settle timeout in milliseconds. */
export function resolveEmbeddedAbortSettleTimeoutMs(..._args: unknown[]): number {
  // Cross-wms does not have config-based timeout resolution.
  return 5_000;
}
