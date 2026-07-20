/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt-abort.ts
 *
 * Embedded attempt abort session lock release.
 * Cross-wms degradation: no-op without session lock management.
 */

/** Releases the embedded attempt session lock on abort. */
export function releaseEmbeddedAttemptSessionLockForAbort(..._args: unknown[]): void {
  // Cross-wms does not have session lock management.
}
