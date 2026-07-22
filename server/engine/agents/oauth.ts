/**
 * Auth profile API-key/OAuth runtime resolver.
 * Ported from openclaw/src/agents/auth-profiles/oauth.ts
 *
 * The full openclaw implementation depends on OAuthManager, plugin runtime,
 * secret ref resolution, and auth profile store. This adapted version provides
 * the core classification, Chutes refresh, and simplified profile resolution.
 */

import type {
  AuthProfileCredential,
  AuthProfileStore,
  OAuthCredential,
} from "./auth-profiles/types.js";
import { refreshChutesTokens } from "./chutes-oauth.js";
import { hasUsableOAuthCredential } from "./oauth-shared.js";

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
 *
 * cross-wms only supports refreshing Chutes OAuth credentials. Other providers
 * require plugin-specific refresh logic not available in this environment.
 * Returns null when the credential cannot be refreshed.
 */
export async function refreshOAuthCredentialForRuntime(params: {
  credential: OAuthCredential;
}): Promise<OAuthCredential | null> {
  const credential = params.credential;
  if (!credential || credential.type !== "oauth") {
    return null;
  }

  // Only Chutes has a self-contained refresh implementation in cross-wms.
  if (credential.provider === "chutes") {
    try {
      const refreshed = await refreshChutesTokens({ credential });
      return {
        ...credential,
        ...refreshed,
        type: "oauth",
      };
    } catch {
      // Refresh failed (missing client id, network, revoked token, etc.)
      return null;
    }
  }

  // Other providers require the openclaw OAuth manager and plugin runtime.
  return null;
}

/** Clear in-process OAuth refresh queues between isolated tests. */
export function resetOAuthRefreshQueuesForTest(): void {
  // No-op in cross-wms: no queue state to reset.
}

function isApiKeyCredential(cred: AuthProfileCredential): cred is AuthProfileCredential & {
  type: "api_key";
  key?: string;
} {
  return cred.type === "api_key";
}

function isTokenCredential(cred: AuthProfileCredential): cred is AuthProfileCredential & {
  type: "token";
  token?: string;
  expires?: number;
} {
  return cred.type === "token";
}

function isOAuthCredential(cred: AuthProfileCredential): cred is OAuthCredential {
  return cred.type === "oauth";
}

function resolveTokenExpiryState(expires: number | undefined): "valid" | "expired" | "invalid_expires" {
  if (expires === undefined) {
    return "valid";
  }
  if (typeof expires !== "number" || !Number.isFinite(expires) || expires <= 0) {
    return "invalid_expires";
  }
  return expires > Date.now() ? "valid" : "expired";
}

/**
 * Resolve a selected auth profile into the provider API key string.
 *
 * cross-wms provides simplified resolution:
 *  - api_key profiles return their key directly
 *  - token profiles check expiry before returning
 *  - oauth profiles refresh via refreshOAuthCredentialForRuntime, then return access token
 *
 * Returns null when the profile cannot be resolved or credentials are missing.
 */
export async function resolveApiKeyForProfile(params: {
  cfg?: unknown;
  store: AuthProfileStore;
  profileId: string;
  agentDir?: string;
  forceRefresh?: boolean;
}): Promise<{
  apiKey: string;
  provider: string;
  email?: string;
} | null> {
  const { store, profileId, forceRefresh } = params;
  const profiles = store?.profiles;
  if (!profiles || typeof profiles !== "object") {
    return null;
  }
  const cred = profiles[profileId] as AuthProfileCredential | undefined;
  if (!cred) {
    return null;
  }

  // API key profiles: return the key directly
  if (isApiKeyCredential(cred)) {
    const key = typeof cred.key === "string" ? cred.key.trim() : undefined;
    if (!key) {
      return null;
    }
    return {
      apiKey: key,
      provider: cred.provider,
      email: cred.email,
    };
  }

  // Token profiles: check expiry before returning
  if (isTokenCredential(cred)) {
    const expiryState = resolveTokenExpiryState(cred.expires);
    if (expiryState === "expired" || expiryState === "invalid_expires") {
      return null;
    }
    const token = typeof cred.token === "string" ? cred.token.trim() : undefined;
    if (!token) {
      return null;
    }
    return {
      apiKey: token,
      provider: cred.provider,
      email: cred.email,
    };
  }

  // OAuth profiles: refresh if needed (or forced), then return access token
  if (isOAuthCredential(cred)) {
    let credential = cred;
    const needsRefresh =
      forceRefresh === true || !hasUsableOAuthCredential(credential as unknown as Record<string, unknown>);
    if (needsRefresh) {
      const refreshed = await refreshOAuthCredentialForRuntime({ credential });
      if (refreshed) {
        credential = refreshed;
      } else if (!hasUsableOAuthCredential(credential as unknown as Record<string, unknown>)) {
        return null;
      }
    }
    const access = typeof credential.access === "string" ? credential.access.trim() : undefined;
    if (!access) {
      return null;
    }
    return {
      apiKey: access,
      provider: credential.provider,
      email: credential.email ?? cred.email,
    };
  }

  return null;
}
