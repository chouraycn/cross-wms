/** Providers. 移植自 openclaw/src/plugins/providers.ts。
 * 降级策略：返回空数组。 */
export type ProviderRegistryLoadParams = {
  config?: any;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
};
export function withBundledProviderVitestCompat(params: any): any {
  void params;
  return undefined;
}
export function resolveBundledProviderCompatPluginIds(params: any): string[] {
  void params;
  return [];
}
export function resolveEnabledProviderPluginIds(params: ProviderRegistryLoadParams): string[] {
  void params;
  return [];
}
export function resolveExternalAuthProfileProviderPluginIds(params: any): string[] {
  void params;
  return [];
}
export function resolveExternalAuthProfileCompatFallbackPluginIds(params: any): string[] {
  void params;
  return [];
}
export function resolveDiscoveredProviderPluginIds(params: any): string[] {
  void params;
  return [];
}
export function resolveDiscoverableProviderOwnerPluginIds(params: any): string[] {
  void params;
  return [];
}
export function resolveActivatableProviderOwnerPluginIds(params: any): string[] {
  void params;
  return [];
}
export const testing = {
  resetCache(): void {
    // 降级
  },
};
export function resolveOwningPluginIdsForProvider(params: any): string[] {
  void params;
  return [];
}
export function resolveOwningPluginIdsForProviderRef(params: any): string[] {
  void params;
  return [];
}
export function resolveOwningPluginIdsForModelRef(params: any): string[] {
  void params;
  return [];
}
export function resolveOwningPluginIdsForModelRefs(params: any): string[] {
  void params;
  return [];
}
export function resolveCatalogHookProviderPluginIds(params: any): string[] {
  void params;
  return [];
}
export { testing as __testing };
