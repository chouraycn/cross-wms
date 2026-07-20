/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.transcript-policy.ts
 *
 * Attempt transcript policy resolution.
 * In cross-wms the full transcript policy infrastructure is not available,
 * so resolveAttemptTranscriptPolicy returns a permissive default.
 */

/** Resolve the transcript policy for an attempt (returns permissive default in cross-wms). */
export function resolveAttemptTranscriptPolicy(..._args: unknown[]): {
  includeToolResults: boolean;
  includeAssistantMessages: boolean;
  includeUserMessages: boolean;
} {
  return {
    includeToolResults: true,
    includeAssistantMessages: true,
    includeUserMessages: true,
  };
}
