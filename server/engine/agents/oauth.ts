/**
 * Auth profile API-key/OAuth runtime resolver.
 * Ported from openclaw/src/agents/auth-profiles/oauth.ts
 *
 * The full openclaw implementation depends on OAuthManager, plugin runtime,
 * secret ref resolution, and auth profile store. This adapted version provides
 * the core classification and stub resolution logic with sensible defaults.
 */

/**
 * Detect provider errors caused by single-use OAuth refresh token races.
 */
export function isRefreshTokenReusedError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return (
    message.includes("refresh_token_reused") ||
    message.includes("refresh token has already been used") ||
    message.includes("already been used to generate a new access token")
  );
}

/**
 * Refresh one OAuth credential and merge provider-returned token fields.
 * Returns null when the credential cannot be refreshed in cross-wms.
 */
export async function refreshOAuthCredentialForRuntime(params: {
  credential: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
  // Full OAuth refresh requires the openclaw OAuth manager, plugin runtime,
  // and provider-specific refresh logic which are not available in cross-wms.
  void params;
  return null;
}

/** Clear in-process OAuth refresh queues between isolated tests. */
export function resetOAuthRefreshQueuesForTest(): void {
  // No-op in cross-wms: no queue state to reset.
}

/**
 * Resolve a selected auth profile into the provider API key string.
 * Returns null when the profile cannot be resolved in cross-wms.
 */
export async function resolveApiKeyForProfile(params: {
  cfg?: unknown;
  store: Record<string, unknown>;
  profileId: string;
  agentDir?: string;
  forceRefresh?: boolean;
}): Promise<{
  apiKey: string;
  provider: string;
  email?: string;
} | null> {
  // Full API key resolution requires the auth profile store, secret ref
  // resolution pipeline, and OAuth manager — not available in cross-wms.
  void params;
  return null;
}
