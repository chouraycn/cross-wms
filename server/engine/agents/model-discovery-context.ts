/**
 * Shared context resolvers for model discovery.
 * Ported from openclaw/src/agents/model-discovery-context.ts
 */

/** Resolve the workspace directory model discovery should use for agent scope. */
export function resolveModelWorkspaceDir(
  cfg: unknown,
  explicitWorkspaceDir: string | undefined,
): string | undefined {
  if (explicitWorkspaceDir !== undefined || !cfg) {
    return explicitWorkspaceDir;
  }
  // Full agent scope resolution not available in cross-wms
  return undefined;
}

/** Resolve the plugin metadata snapshot for model discovery. */
export function resolveModelPluginMetadataSnapshot(params: {
  allowWorkspaceScopedCurrent?: boolean;
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  pluginMetadataSnapshot?: unknown;
  useRuntimeConfig?: boolean;
  workspaceDir?: string;
}): unknown | undefined {
  if (params.pluginMetadataSnapshot) {
    return params.pluginMetadataSnapshot;
  }
  // Full plugin metadata resolution not available in cross-wms
  return undefined;
}
