/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt-trajectory-flush-cleanup.ts
 *
 * Cross-wms degradation: no trajectory recorder, performs no-op cleanup.
 */

/** Flushes the embedded attempt trajectory recorder for cleanup. */
export function flushEmbeddedAttemptTrajectoryRecorder(..._args: unknown[]): void {
  // Cross-wms does not have the trajectory recorder subsystem.
}
