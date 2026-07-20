/**
 * Attempt runner stub — the full runEmbeddedAttempt function is deeply
 * entangled with the embedded-agent-runner loop, LLM transport, and
 * harness runtime. This stub returns a sensible default result instead
 * of throwing, allowing callers to proceed without the full runtime.
 * Ported from openclaw/src/agents/embedded-agent-runner/run/attempt.ts
 */

export type RunEmbeddedAttemptResult = {
  status: "skipped";
  reason: string;
};

/**
 * In openclaw this is the core embedded attempt runner that drives the LLM
 * loop, manages tool calls, compaction, and delivery. The full implementation
 * requires the complete embedded-agent-runner runtime (LLM transport, session
 * store, compaction pipeline, etc.) which is not available in cross-wms.
 *
 * This stub returns a skipped result so callers can test their integration
 * without the full agent runtime.
 */
export function runEmbeddedAttempt(..._args: unknown[]): RunEmbeddedAttemptResult {
  return {
    status: "skipped",
    reason: "runEmbeddedAttempt: embedded agent runner not available in cross-wms",
  };
}
