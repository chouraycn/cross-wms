/**
 * Plugin runtime registry — process-global active registry tracking.
 * 移植自 openclaw/src/plugins/runtime.ts。
 * 降级策略：返回 null/undefined/空。
 */
/** 占位：PluginRegistry。 */
type PluginRegistry = unknown;

export function collectLivePluginRegistries(): PluginRegistry[] {
  return [];
}
export function recordImportedPluginId(pluginId: string): void {
  void pluginId;
}
export function setActivePluginRegistry(params: {
  registry: PluginRegistry;
  workspaceDir?: string;
}): void {
  void params;
}
export function getActivePluginRegistry(): PluginRegistry | null {
  return null;
}
export function getActivePluginRegistryWorkspaceDir(): string | undefined {
  return undefined;
}
export function requireActivePluginRegistry(): PluginRegistry {
  throw new Error("not implemented: no active plugin registry");
}
export function pinActivePluginHttpRouteRegistry(registry: PluginRegistry): void {
  void registry;
}
export function releasePinnedPluginHttpRouteRegistry(registry?: PluginRegistry): void {
  void registry;
}
export function getActivePluginHttpRouteRegistry(): PluginRegistry | null {
  return null;
}
export function getActivePluginHttpRouteRegistryVersion(): number {
  return 0;
}
export function requireActivePluginHttpRouteRegistry(): PluginRegistry {
  throw new Error("not implemented: no active plugin http route registry");
}
export function resolveActivePluginHttpRouteRegistry(fallback: PluginRegistry): PluginRegistry {
  return fallback;
}
export function pinActivePluginChannelRegistry(registry: PluginRegistry): void {
  void registry;
}
export function releasePinnedPluginChannelRegistry(registry?: PluginRegistry): void {
  void registry;
}
export function getActivePluginChannelRegistry(): PluginRegistry | null {
  return null;
}
