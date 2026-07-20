/**
 * Ported from openclaw/src/agents/embedded-agent-runner/run/auth-profile-failure-policy.ts
 *
 * Resolves why an auth profile failed during provider auth selection.
 * Ported from the OpenClaw source with simplified types.
 */

/** Resolves the auth profile failure reason for a given failover outcome. */
export function resolveAuthProfileFailureReason(params: {
  failoverReason: string | null;
  providerStarted?: boolean;
  transientRateLimit?: boolean;
  policy?: string;
}): string | null {
  if (
    params.policy === "local" ||
    !params.failoverReason ||
    (params.policy === "local_transient" &&
      (params.failoverReason === "overloaded" ||
        (params.failoverReason === "rate_limit" && params.transientRateLimit === true))) ||
    params.failoverReason === "server_error" ||
    params.failoverReason === "empty_response" ||
    params.failoverReason === "format"
  ) {
    return null;
  }
  if (params.failoverReason === "timeout" && params.providerStarted !== true) {
    return null;
  }
  return params.failoverReason;
}
