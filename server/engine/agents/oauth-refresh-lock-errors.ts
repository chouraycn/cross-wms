/**
 * Ported from openclaw/src/agents/auth-profiles/oauth-refresh-lock-errors.ts
 *
 * OAuth refresh lock error helpers.
 * Cross-wms degradation: simplified without file lock error codes.
 */

/** Returns true when an error came from the global OAuth refresh lock. */
export function isGlobalRefreshLockTimeoutError(error: any, lockPath: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: any; lockPath?: any };
  return candidate.code === "FILE_LOCK_TIMEOUT" && candidate.lockPath === `${lockPath}.lock`;
}

/** Builds the user-facing OAuth refresh contention error. */
export function buildRefreshContentionError(params: {
  provider: string;
  profileId: string;
  cause: any;
}): Error & { code: "refresh_contention"; cause: any } {
  return Object.assign(
    new Error(
      `OAuth refresh failed (refresh_contention): another process is already refreshing ${params.provider} for ${params.profileId}. Please wait for the in-flight refresh to finish and retry.`,
      { cause: params.cause },
    ),
    {
      code: "refresh_contention" as const,
      cause: params.cause,
    },
  );
}
