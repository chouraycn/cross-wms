/**
 * Ported from openclaw/src/agents/model-auth-env-vars.ts
 *
 * Provider auth env/evidence lookup facade.
 * Cross-wms degradation: returns empty lookup maps without secrets resolution.
 */

/** Resolves both env-var candidates and richer auth evidence from one manifest snapshot. */
export function resolveProviderEnvAuthLookupMaps(
  _params?: Record<string, unknown>,
): { envCandidateMap: Record<string, readonly string[]>; authEvidenceMap: Record<string, readonly unknown[]> } {
  // Cross-wms does not have the secrets/provider-env-vars module.
  return { envCandidateMap: {}, authEvidenceMap: {} };
}

/** Lists every provider key represented by either env candidates or auth evidence. */
export function listProviderEnvAuthLookupKeys(params: {
  envCandidateMap: Readonly<Record<string, readonly string[]>>;
  authEvidenceMap: Readonly<Record<string, readonly unknown[]>>;
}): string[] {
  return Array.from(
    new Set([...Object.keys(params.envCandidateMap), ...Object.keys(params.authEvidenceMap)]),
  ).toSorted((a, b) => a.localeCompare(b));
}

/** Lists known provider API-key env var names for redaction and marker matching. */
export function listKnownProviderEnvApiKeyNames(): string[] {
  // Cross-wms does not have the known env var registry.
  return [];
}
