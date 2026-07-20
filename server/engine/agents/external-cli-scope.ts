/**
 * Ported from openclaw/src/agents/auth-profiles/external-cli-scope.ts
 *
 * External CLI auth discovery scope extraction from config.
 * Cross-wms degradation: simplified without openclaw config types.
 */

/** Provider/profile ids that may need external CLI auth discovery. */
export type ExternalCliAuthScope = {
  providerIds: string[];
  profileIds: string[];
};

/** Resolves external CLI auth discovery scope from configured auth/model surfaces. */
export function resolveExternalCliAuthScopeFromConfig(
  cfg: Record<string, unknown>,
): ExternalCliAuthScope | undefined {
  const providerIds = new Set<string>();
  const profileIds = new Set<string>();

  const models = cfg.models as Record<string, unknown> | undefined;
  const providers = models?.providers as Record<string, unknown> | undefined;
  if (providers) {
    for (const id of Object.keys(providers)) {
      const raw = id.trim();
      if (raw) providerIds.add(raw);
    }
  }

  const auth = cfg.auth as Record<string, unknown> | undefined;
  const profiles = auth?.profiles as Record<string, unknown> | undefined;
  if (profiles) {
    for (const [profileId, profile] of Object.entries(profiles)) {
      const normalizedProfileId = profileId.trim();
      if (normalizedProfileId) profileIds.add(normalizedProfileId);
      if (profile && typeof profile === "object") {
        const p = profile as Record<string, unknown>;
        if (typeof p.provider === "string" && p.provider.trim()) {
          providerIds.add(p.provider.trim());
        }
      }
    }
  }

  if (providerIds.size === 0 && profileIds.size === 0) {
    return undefined;
  }
  return {
    providerIds: [...providerIds].toSorted((left, right) => left.localeCompare(right)),
    profileIds: [...profileIds].toSorted((left, right) => left.localeCompare(right)),
  };
}
