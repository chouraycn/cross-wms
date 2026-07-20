/**
 * 移植自 openclaw/src/agents/auth-profiles/credential-normalize.ts
 *
 * Normalizes auth profile credentials for safe storage.
 * In cross-wms the full secret normalization infrastructure is not available,
 * so normalizeAuthProfileCredential returns credentials as-is.
 */

/** Normalize an auth profile credential for safe storage (passthrough in cross-wms). */
export function normalizeAuthProfileCredential<T = unknown>(credential: T): T {
  return credential;
}
