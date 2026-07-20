/**
 * 移植自 openclaw/src/agents/model-fallback-observation.ts
 *
 * Structured logging for model fallback decisions. cross-wms provides
 * a simplified implementation with console-based logging since the full
 * subsystem logger infrastructure is not available.
 */

/** Structured fields that describe one fallback-chain transition. */
export type ModelFallbackStepFields = {
  fallbackStepType: "fallback_step";
  fallbackStepFromModel: string;
  fallbackStepToModel?: string;
  fallbackStepFromFailureReason?: string;
  fallbackStepFromFailureDetail?: string;
  fallbackStepChainPosition?: number;
  fallbackStepFinalOutcome: "next_fallback" | "succeeded" | "chain_exhausted";
};

/** Input payload for logging one model fallback decision. */
export type ModelFallbackDecisionParams = {
  decision: "skip_candidate" | "probe_cooldown_candidate" | "candidate_failed" | "candidate_succeeded";
  runId?: string;
  sessionId?: string;
  lane?: string;
  requestedProvider: string;
  requestedModel: string;
  candidate: { provider: string; model: string };
  attempt?: number;
  total?: number;
  reason?: string | null;
  status?: number;
  code?: string;
  error?: string;
  nextCandidate?: { provider: string; model: string };
  isPrimary?: boolean;
  requestedModelMatched?: boolean;
  fallbackConfigured?: boolean;
  allowTransientCooldownProbe?: boolean;
  profileCount?: number;
  previousAttempts?: Array<{ provider: string; model: string; reason?: string; status?: number; code?: string; error?: string }>;
};

/** Return whether fallback decision logging is enabled — always false in cross-wms. */
export function isModelFallbackDecisionLogEnabled(): boolean {
  return false;
}

/** Reset coalescing state for tests — no-op in cross-wms. */
export function resetModelFallbackDecisionLogCoalescingForTest(): void {
  // No-op: cross-wms does not maintain coalescing state.
}

/** Log one model fallback decision and return structured fallback-step fields. */
export function logModelFallbackDecision(
  params: ModelFallbackDecisionParams,
): ModelFallbackStepFields | undefined {
  // In cross-wms, fallback logging is disabled. Build step fields for return value only.
  if (
    params.decision === "skip_candidate" ||
    params.decision === "candidate_failed" ||
    params.decision === "candidate_succeeded"
  ) {
    const candidateRef = `${params.candidate.provider}/${params.candidate.model}`;
    const nextRef = params.nextCandidate
      ? `${params.nextCandidate.provider}/${params.nextCandidate.model}`
      : undefined;
    const lastPreviousAttempt = params.previousAttempts?.at(-1);

    if (params.decision === "candidate_succeeded" && lastPreviousAttempt) {
      return {
        fallbackStepType: "fallback_step",
        fallbackStepFromModel: `${lastPreviousAttempt.provider}/${lastPreviousAttempt.model}`,
        fallbackStepToModel: `${params.candidate.provider}/${params.candidate.model}`,
        ...(lastPreviousAttempt.reason ? { fallbackStepFromFailureReason: lastPreviousAttempt.reason } : {}),
        ...(lastPreviousAttempt.error ? { fallbackStepFromFailureDetail: lastPreviousAttempt.error } : {}),
        ...(typeof params.attempt === "number" ? { fallbackStepChainPosition: params.attempt } : {}),
        fallbackStepFinalOutcome: "succeeded",
      };
    }

    return {
      fallbackStepType: "fallback_step",
      fallbackStepFromModel: candidateRef,
      ...(nextRef ? { fallbackStepToModel: nextRef } : {}),
      ...(params.reason ? { fallbackStepFromFailureReason: params.reason } : {}),
      ...(typeof params.attempt === "number" ? { fallbackStepChainPosition: params.attempt } : {}),
      fallbackStepFinalOutcome: nextRef ? "next_fallback" : "chain_exhausted",
    };
  }
  return undefined;
}
