/**
 * Discovers implicit model-provider config from plugin provider catalogs and
 * static catalogs. It merges discovered provider models with explicit config
 * while preserving user-controlled provider fields.
 * Ported from openclaw/src/agents/models-config.providers.implicit.ts
 *
 * The full implementation requires the plugin discovery runtime, model catalog
 * core, and auth profile store. This adapted version provides the test-visible
 * filter helpers and returns an empty provider set from resolveImplicitProviders.
 */

/** Resolve the plugin discovery filter used by implicit provider discovery tests. */
export function resolveProviderDiscoveryFilterForTest(params: {
  config?: Record<string, unknown>;
  workspaceDir?: string;
  env: NodeJS.ProcessEnv;
  resolveOwners?: (provider: string) => readonly string[] | undefined;
  providerIds?: readonly string[];
}): string[] | undefined {
  const { env } = params;
  const testRaw = env.OPENCLAW_TEST_ONLY_PROVIDER_PLUGIN_IDS?.trim();
  if (testRaw) {
    const ids = testRaw
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id.length > 0);
    const unique = [...new Set(ids)].sort();
    return unique.length > 0 ? unique : undefined;
  }
  if (params.providerIds && params.providerIds.length > 0) {
    const ids = params.providerIds
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id.length > 0);
    const unique = [...new Set(ids)].sort();
    return unique.length > 0 ? unique : undefined;
  }
  return undefined;
}

/** Resolve provider owner plugin IDs from a preloaded metadata snapshot for tests. */
export function resolvePluginMetadataProviderOwnersForTest(
  _pluginMetadataSnapshot: unknown,
  _provider: string,
): readonly string[] | undefined {
  // Full plugin metadata owner resolution requires the plugin metadata snapshot system.
  return undefined;
}

/** Resolve all implicit provider configs contributed by runtime plugin discovery. */
export async function resolveImplicitProviders(
  _params: {
    agentDir: string;
    config?: Record<string, unknown>;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
    explicitProviders?: Record<string, unknown> | null;
    providerDiscoveryProviderIds?: readonly string[];
    providerDiscoveryTimeoutMs?: number;
    providerDiscoveryEntriesOnly?: boolean;
  },
): Promise<Record<string, unknown>> {
  // Full implicit provider discovery requires the plugin runtime, model catalog
  // core, and auth profile store — not available in cross-wms.
  return {};
}
