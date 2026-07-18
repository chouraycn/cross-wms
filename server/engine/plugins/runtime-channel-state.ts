/**
 * Runtime channel state.
 * 移植自 openclaw/src/plugins/runtime-channel-state.ts。
 * 降级策略：返回 null/0。
 */
export const PLUGIN_REGISTRY_STATE = Symbol.for("openclaw.pluginRegistryState");

/** 占位：ActivePluginChannelRegistry。 */
type ActivePluginChannelRegistry = unknown;

export type ActivePluginChannelRegistrySnapshot = {
  registry: ActivePluginChannelRegistry | null;
  version: number;
};

export function getActivePluginChannelRegistrySnapshotFromState(): ActivePluginChannelRegistrySnapshot {
  return { registry: null, version: 0 };
}

export function getActivePluginChannelRegistryFromState(): ActivePluginChannelRegistry | null {
  return null;
}

export function getActivePluginChannelRegistryVersionFromState(): number {
  return 0;
}
