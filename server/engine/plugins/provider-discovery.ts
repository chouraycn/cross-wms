/** Provider discovery. 移植自 openclaw/src/plugins/provider-discovery.ts。
 * 降级策略：返回空/默认值。 */
export type ResolveRuntimePluginDiscoveryProvidersParams = {
  config?: any;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
};
export type ResolveInstalledPluginProviderContributionIdsParams = unknown;
export function resolveInstalledPluginProviderContributionIds(params: any): string[] {
  void params;
  return [];
}
export async function resolveRuntimePluginDiscoveryProviders(params: any): Promise<any[]> {
  void params;
  return [];
}
export function groupPluginDiscoveryProvidersByOrder(params: any): any {
  void params;
  return {};
}
export function providerMatchesFilter(params: any): boolean {
  void params;
  return false;
}
export function normalizePluginDiscoveryResult(params: any): any {
  void params;
  return undefined;
}
export function runProviderCatalog(params: any): any {
  void params;
  return undefined;
}
export function runProviderStaticCatalog(params: any): any {
  void params;
  return undefined;
}
