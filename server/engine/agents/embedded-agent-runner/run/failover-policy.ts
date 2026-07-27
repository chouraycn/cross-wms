import type { FailoverReason } from "../../embedded-agent-helpers.js";

export type AssistantFailoverDecision =
  | { action: "rotate_profile"; reason: FailoverReason }
  | { action: "fallback_model"; reason: FailoverReason }
  | { action: "surface_error"; reason: FailoverReason | null };

export type RunFailoverStage = "prompt" | "assistant";

export function resolveRunFailoverDecision(params: {
  stage: RunFailoverStage;
  allowFormatRetry?: boolean;
  aborted: boolean;
  externalAbort: boolean;
  fallbackConfigured: boolean;
  failoverFailure: boolean;
  failoverReason: FailoverReason | null;
  timedOut: boolean;
  idleTimedOut: boolean;
  timedOutDuringCompaction: boolean;
  timedOutDuringToolExecution: boolean;
  profileRotated?: boolean;
}): AssistantFailoverDecision {
  const {
    aborted,
    externalAbort,
    fallbackConfigured,
    failoverFailure,
    failoverReason,
    timedOut,
    idleTimedOut,
    timedOutDuringCompaction,
    timedOutDuringToolExecution,
    profileRotated,
  } = params;

  if (aborted || externalAbort) {
    return { action: "surface_error", reason: failoverReason };
  }

  if (failoverReason === "context_overflow") {
    return { action: "surface_error", reason: failoverReason };
  }

  if (failoverReason === "format" && !params.allowFormatRetry) {
    return { action: "surface_error", reason: failoverReason };
  }

  if (failoverFailure && failoverReason) {
    if (failoverReason === "auth" || failoverReason === "auth_permanent" || failoverReason === "billing") {
      if (!profileRotated) {
        return { action: "rotate_profile", reason: failoverReason };
      }
      if (fallbackConfigured) {
        return { action: "fallback_model", reason: failoverReason };
      }
      return { action: "surface_error", reason: failoverReason };
    }

    if (failoverReason === "rate_limit" || failoverReason === "overloaded" || failoverReason === "server_error") {
      if (!profileRotated) {
        return { action: "rotate_profile", reason: failoverReason };
      }
      if (fallbackConfigured) {
        return { action: "fallback_model", reason: failoverReason };
      }
      return { action: "surface_error", reason: failoverReason };
    }

    if (failoverReason === "timeout" && !timedOutDuringToolExecution) {
      if (!profileRotated && !idleTimedOut) {
        return { action: "rotate_profile", reason: failoverReason };
      }
      if (fallbackConfigured && !timedOutDuringCompaction) {
        return { action: "fallback_model", reason: failoverReason };
      }
      return { action: "surface_error", reason: failoverReason };
    }

    if (fallbackConfigured) {
      return { action: "fallback_model", reason: failoverReason };
    }
  }

  return { action: "surface_error", reason: failoverReason };
}

export function mergeRetryFailoverReason(params: {
  previous: FailoverReason | null;
  failoverReason: FailoverReason | null;
  timedOut: boolean;
}): FailoverReason | null {
  if (params.failoverReason) {
    return params.failoverReason;
  }
  if (params.timedOut) {
    return "timeout";
  }
  return params.previous;
}
