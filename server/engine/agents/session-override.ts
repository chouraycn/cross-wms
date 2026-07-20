/**
 * 移植自 openclaw/src/agents/auth-profiles/session-override.ts
 *
 * Session auth profile override helpers.
 * In cross-wms the auth profile session override infrastructure is not available,
 * so clearSessionAuthProfileOverride is a no-op and
 * resolveSessionAuthProfileOverride returns undefined.
 */

/** Clear the auth profile override for a session (no-op in cross-wms). */
export function clearSessionAuthProfileOverride(..._args: unknown[]): void {
  // No-op: session auth profile override not available in cross-wms.
}

/** Resolve the auth profile override for a session (returns undefined in cross-wms). */
export function resolveSessionAuthProfileOverride(..._args: unknown[]): undefined {
  return undefined;
}
