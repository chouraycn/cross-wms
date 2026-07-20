/**
 * Auth profile repair helpers.
 * Ported from openclaw/src/agents/auth-profiles/repair.ts
 */

function normalizeProviderId(provider: string): string {
  return provider.toLowerCase().trim();
}

function getProfileSuffix(profileId: string): string {
  const idx = profileId.indexOf(":");
  if (idx < 0) {
    return "";
  }
  return profileId.slice(idx + 1);
}

/** Suggests a modern OAuth profile id for a legacy provider:default profile. */
export function suggestOAuthProfileIdForLegacyDefault(params: {
  cfg?: unknown;
  store: unknown;
  provider: string;
  legacyProfileId: string;
}): string | null {
  const providerKey = normalizeProviderId(params.provider);
  const legacySuffix = getProfileSuffix(params.legacyProfileId);
  if (legacySuffix !== "default") {
    return null;
  }
  // Full profile lookup requires auth profile store infrastructure not available in cross-wms
  return null;
}

/** Migrates config auth profile references away from a legacy OAuth default id. */
export function repairOAuthProfileIdMismatch(params: {
  cfg: unknown;
  store: unknown;
  provider: string;
  legacyProfileId?: string;
}): { config: unknown; changes: string[]; migrated: boolean; fromProfileId?: string; toProfileId?: string } {
  const legacyProfileId =
    params.legacyProfileId ?? `${normalizeProviderId(params.provider)}:default`;
  // Full migration requires auth profile store infrastructure not available in cross-wms
  return { config: params.cfg, changes: [], migrated: false };
}
