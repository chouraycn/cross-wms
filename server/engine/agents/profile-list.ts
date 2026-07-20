/**
 * 移植自 openclaw/src/agents/auth-profiles/profile-list.ts
 *
 * Auth profile list helpers.
 * Provides provider-compatible profile lookup and stable de-duplication.
 * cross-wms 简化实现：提供基本的 profile 列表和去重功能。
 */

/** Deduplicates profile ids while preserving first-seen order. */
export function dedupeProfileIds(profileIds: string[]): string[] {
  const seen = new Set<string>();
  return profileIds.filter((id) => {
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

export type AuthProfileStore = {
  profiles: Record<string, AuthProfileCredential>;
};

export type AuthProfileCredential = {
  type: "api_key" | "token" | "oauth";
  provider: string;
  key?: string;
  token?: string;
  email?: string;
  displayName?: string;
  clientId?: string;
  enterpriseUrl?: string;
  projectId?: string;
  accountId?: string;
};

function resolveProviderIdForAuth(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  // Normalize common aliases
  if (normalized === "openai" || normalized === "chatgpt") return "openai";
  if (normalized === "anthropic" || normalized === "claude" || normalized === "claude-cli") return "anthropic";
  if (normalized === "google" || normalized === "google-gemini-cli" || normalized === "gemini") return "google";
  return normalized;
}

/** Lists auth profile ids whose credential provider matches the requested provider. */
export function listProfilesForProvider(store: AuthProfileStore, provider: string): string[] {
  const providerKey = resolveProviderIdForAuth(provider);
  return Object.entries(store.profiles)
    .filter(([, cred]) => resolveProviderIdForAuth(cred.provider) === providerKey)
    .map(([id]) => id);
}

/** Resolves subscription auth mode for a set of profiles. */
export function resolveSubscriptionAuthModeForProfiles(params: {
  store: AuthProfileStore;
  profileIds: ReadonlyArray<string | undefined>;
}): "oauth" | "token" | undefined {
  for (const profileId of params.profileIds) {
    const type = profileId ? params.store.profiles[profileId]?.type : undefined;
    if (type === "oauth" || type === "token") {
      return type;
    }
  }
  return undefined;
}
