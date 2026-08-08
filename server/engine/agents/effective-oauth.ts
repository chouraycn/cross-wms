/**
 * Ported from openclaw/src/agents/auth-profiles/effective-oauth.ts
 *
 * Effective OAuth credential resolver.
 * Cross-wms degradation: returns the credential unchanged without external CLI bootstrap.
 */

/** Resolves the effective OAuth credential, optionally reading external CLI bootstrap state. */
export function resolveEffectiveOAuthCredential(params: {
  profileId: string;
  credential: Record<string, any>;
  allowKeychainPrompt?: boolean;
}): Record<string, any> {
  // Cross-wms does not have the managed OAuth selector or external CLI bootstrap.
  // Return the credential as-is.
  return params.credential;
}
