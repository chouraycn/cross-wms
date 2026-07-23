/**
 * Runtime state — process-global plugin registry state.
 * 移植自 openclaw/src/plugins/runtime-state.ts。
 * 降级策略：返回 undefined/null。
 */
import type { PluginRegistry } from "./registry-types.js";

export const PLUGIN_REGISTRY_STATE = Symbol.for("openclaw.pluginRegistryState");

export type RuntimeTrackedPluginRegistry = PluginRegistry;

export type RegistrySurfaceState = {
  registry: RuntimeTrackedPluginRegistry | null;
  pinned: boolean;
  version: number;
  activeRegistry?: RuntimeTrackedPluginRegistry;
  workspaceDir?: string;
};

export type RegistryState = {
  active?: RegistrySurfaceState;
  pinnedHttpRouteRegistry?: RuntimeTrackedPluginRegistry;
  pinnedChannelRegistry?: RuntimeTrackedPluginRegistry;
  activeRegistry: RuntimeTrackedPluginRegistry | null;
  activeVersion: number;
  httpRoute: RegistrySurfaceState;
  channel: RegistrySurfaceState;
  sessionExtension: RegistrySurfaceState;
  agentEventBridgeUnsubscribe?: () => void;
  key: string | null;
  workspaceDir: string | null;
  runtimeSubagentMode: "default" | "explicit" | "gateway-bindable";
  importedPluginIds: Set<string>;
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
