/**
 * Ported from openclaw/src/agents/auth-profiles/oauth-refresh-lock-errors.ts
 *
 * OAuth refresh lock error helpers.
 * Cross-wms degradation: simplified without file lock error codes.
 */

/** Returns true when an error came from the global OAuth refresh lock. */
export function isGlobalRefreshLockTimeoutError(error: unknown, lockPath: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; lockPath?: unknown };
  return candidate.code === "FILE_LOCK_TIMEOUT" && candidate.lockPath === `${lockPath}.lock`;
}

/** Builds the user-facing OAuth refresh contention error. */
export function buildRefreshContentionError(params: {
  provider: string;
  profileId: string;
  cause: unknown;
}): Error & { code: "refresh_contention"; cause: unknown } {
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
