/**
 * Provider auth alias resolution.
 * Ported from openclaw/src/agents/provider-auth-aliases.ts
 *
 * Note: Full plugin metadata resolution is not available in cross-wms.
 * These functions return sensible defaults with the same signature.
 */

function normalizeProviderId(provider: string): string {
  return provider.toLowerCase().trim();
}

export type ProviderAuthAliasLookupParams = {
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  includeUntrustedWorkspacePlugins?: boolean;
  metadataSnapshot?: unknown;
};

/** Clear provider auth alias cache for tests. */
export function resetProviderAuthAliasMapCacheForTest(): void {
  // No-op in cross-wms; cache is not used
}

/** Resolve canonical auth provider aliases from plugin metadata. */
export function resolveProviderAuthAliasMap(_params?: ProviderAuthAliasLookupParams): Record<string, string> {
  // Plugin metadata infrastructure not available in cross-wms
  return Object.create(null) as Record<string, string>;
}

/** Resolve the provider ID that should be used for credential lookup. */
export function resolveProviderIdForAuth(
  provider: string,
  _params?: ProviderAuthAliasLookupParams,
): string {
  const normalized = normalizeProviderId(provider);
  if (!normalized) {
    return normalized;
  }
  const aliasMap = resolveProviderAuthAliasMap(_params);
  return aliasMap[normalized] ?? normalized;
}
