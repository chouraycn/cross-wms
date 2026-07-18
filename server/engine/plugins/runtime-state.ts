/**
 * Runtime state — process-global plugin registry state.
 * 移植自 openclaw/src/plugins/runtime-state.ts。
 * 降级策略：返回 undefined/null。
 */
export const PLUGIN_REGISTRY_STATE = Symbol.for("openclaw.pluginRegistryState");

/** 占位：PluginRegistry。 */
type PluginRegistry = unknown;

export type RuntimeTrackedPluginRegistry = PluginRegistry;

export type RegistrySurfaceState = {
  activeRegistry?: RuntimeTrackedPluginRegistry;
  workspaceDir?: string;
};

export type RegistryState = {
  active?: RegistrySurfaceState;
  pinnedHttpRouteRegistry?: RuntimeTrackedPluginRegistry;
  pinnedChannelRegistry?: RuntimeTrackedPluginRegistry;
};

export function getPluginRegistryState(): RegistryState | undefined {
  return undefined;
}

export function getActivePluginChannelRegistryFromState(): RuntimeTrackedPluginRegistry | null {
  return null;
}

export function getActivePluginRegistryWorkspaceDirFromState(): string | undefined {
  return undefined;
}
