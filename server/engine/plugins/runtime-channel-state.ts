/**
 * Runtime channel state.
 * 移植自 openclaw/src/plugins/runtime-channel-state.ts。
 *
 * 从 globalThis[PLUGIN_REGISTRY_STATE] 读取活动通道注册表快照。
 * 状态由 ./runtime.ts 中的 setActivePluginRegistry / pinActivePluginChannelRegistry 写入。
 */
import type { PluginRegistry } from "./registry-types.js";
import { PLUGIN_REGISTRY_STATE, type RegistryState } from "./runtime-state.js";

type GlobalChannelRegistryState = typeof globalThis & {
  [PLUGIN_REGISTRY_STATE]?: RegistryState;
};

type GlobalChannelRegistryRuntimeState = GlobalChannelRegistryState[typeof PLUGIN_REGISTRY_STATE];

export type ActivePluginChannelRegistrySnapshot = {
  registry: PluginRegistry | null;
  version: number;
};

let activePluginChannelRegistrySnapshot:
  | {
      state: GlobalChannelRegistryRuntimeState;
      pinnedRegistry: PluginRegistry | null;
      activeRegistry: PluginRegistry | null;
      pinnedChannelCount: number;
      activeChannelCount: number;
      snapshot: ActivePluginChannelRegistrySnapshot;
    }
  | undefined;

function countChannels(registry: PluginRegistry | null | undefined): number {
  return registry?.channels?.length ?? 0;
}

function asPluginRegistry(
  registry: RegistryState["activeRegistry"],
): PluginRegistry | null {
  return registry as PluginRegistry | null;
}

/** 返回缓存的通道注册表快照，优先使用 pinned 通道状态。 */
export function getActivePluginChannelRegistrySnapshotFromState(): ActivePluginChannelRegistrySnapshot {
  const state = (globalThis as GlobalChannelRegistryState)[PLUGIN_REGISTRY_STATE];
  const pinnedRegistry = asPluginRegistry(state?.channel.registry ?? null);
  const activeRegistry = asPluginRegistry(state?.activeRegistry ?? null);
  const pinnedChannelCount = countChannels(pinnedRegistry);
  const activeChannelCount = countChannels(activeRegistry);
  const selectedPinnedRegistry =
    pinnedChannelCount > 0 || (pinnedRegistry !== null && activeChannelCount === 0);
  const version = selectedPinnedRegistry
    ? (state?.channel.version ?? 0)
    : (state?.activeVersion ?? 0);
  const cached = activePluginChannelRegistrySnapshot;
  if (
    cached &&
    cached.state === state &&
    cached.pinnedRegistry === pinnedRegistry &&
    cached.activeRegistry === activeRegistry &&
    cached.pinnedChannelCount === pinnedChannelCount &&
    cached.activeChannelCount === activeChannelCount &&
    cached.snapshot.version === version
  ) {
    return cached.snapshot;
  }
  const registry = selectedPinnedRegistry ? pinnedRegistry : activeRegistry;
  const snapshot = { registry, version };
  activePluginChannelRegistrySnapshot = {
    state,
    pinnedRegistry,
    activeRegistry,
    pinnedChannelCount,
    activeChannelCount,
    snapshot,
  };
  return snapshot;
}

/** 返回当前活动的插件通道注册表。 */
export function getActivePluginChannelRegistryFromState(): PluginRegistry | null {
  return getActivePluginChannelRegistrySnapshotFromState().registry;
}

/** 返回当前活动的插件通道注册表版本号。 */
export function getActivePluginChannelRegistryVersionFromState(): number {
  return getActivePluginChannelRegistrySnapshotFromState().version;
}
