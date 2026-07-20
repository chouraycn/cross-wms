/**
 * Ported from openclaw/src/agents/agent-auth-discovery.ts
 *
 * Discovers agent runtime credentials from auth profiles, env, and synthetic providers.
 * Cross-wms degradation: delegates to core re-export, returns empty credential map
 * for the full discovery function.
 */

export { addEnvBackedAgentCredentials } from "./agent-auth-discovery-core.js";

export type DiscoverAuthStorageOptions = {
  externalCli?: Record<string, unknown>;
  readOnly?: boolean;
  skipExternalAuthProfiles?: boolean;
  skipCredentials?: boolean;
  syntheticAuthProviderRefs?: Iterable<string>;
  config?: Record<string, unknown>;
  workspaceDir?: string;
  env?: Record<string, string | undefined>;
};

/** Resolves agent credentials from auth profiles, env, and synthetic auth hooks. */
export function resolveAgentCredentialsForDiscovery(
  agentDir: string,
  options?: DiscoverAuthStorageOptions,
): Record<string, unknown> {
  // Cross-wms does not have the full auth profile store / synthetic auth pipeline.
  // Return an empty credential map.
  return {};
}
