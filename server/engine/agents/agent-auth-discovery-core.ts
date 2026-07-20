/**
 * 移植自 openclaw/src/agents/agent-auth-discovery-core.ts
 *
 * Env/config-backed credential discovery shared by agent auth discovery modes.
 * In cross-wms the full model-auth-env infrastructure is not available,
 * so addEnvBackedAgentCredentials returns credentials unchanged.
 */

/** Options for discovering env-backed credentials during agent auth discovery. */
export type AgentDiscoveryAuthLookupOptions = {
  config?: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
};

/** Adds provider credentials resolvable from env/config (returns unchanged in cross-wms). */
export function addEnvBackedAgentCredentials(
  credentials: Record<string, unknown>,
  _options: AgentDiscoveryAuthLookupOptions = {},
): Record<string, unknown> {
  return { ...credentials };
}
