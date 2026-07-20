/**
 * Ported from openclaw/src/agents/model-registry-loader.ts
 *
 * Shared model-registry loader for agent paths.
 * Cross-wms degradation: returns empty registry without auth/model discovery.
 */

/** Options controlling model discovery, credential reads, and normalization. */
type LoadAgentModelRegistryOptions = {
  providerFilter?: string;
  normalizeModels?: boolean;
  readOnly?: boolean;
  skipCredentials?: boolean;
  workspaceDir?: string;
};

/** Load the agent model registry with optional provider filtering/normalization. */
export function loadAgentModelRegistry(
  config: Record<string, unknown>,
  options: LoadAgentModelRegistryOptions = {},
): { agentDir: string; registry: Record<string, unknown> } {
  // Cross-wms does not have auth storage or model discovery pipeline.
  return {
    agentDir: "",
    registry: {},
  };
}
