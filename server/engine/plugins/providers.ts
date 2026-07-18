/** Providers. 移植自 openclaw/src/plugins/providers.ts。
 * 降级策略：返回空数组。 */
export type ProviderRegistryLoadParams = {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
};
export function withBundledProviderVitestCompat(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveBundledProviderCompatPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export function resolveEnabledProviderPluginIds(params: ProviderRegistryLoadParams): string[] {
  void params;
  return [];
}
export function resolveExternalAuthProfileProviderPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export function resolveExternalAuthProfileCompatFallbackPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export function resolveDiscoveredProviderPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export function resolveDiscoverableProviderOwnerPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export function resolveActivatableProviderOwnerPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export const testing = {
  resetCache(): void {
    // 降级
  },
};
export function resolveOwningPluginIdsForProvider(params: unknown): string[] {
  void params;
  return [];
}
export function resolveOwningPluginIdsForProviderRef(params: unknown): string[] {
  void params;
  return [];
}
export function resolveOwningPluginIdsForModelRef(params: unknown): string[] {
  void params;
  return [];
}
export function resolveOwningPluginIdsForModelRefs(params: unknown): string[] {
  void params;
  return [];
}
export function resolveCatalogHookProviderPluginIds(params: unknown): string[] {
  void params;
  return [];
}
export { testing as __testing };
