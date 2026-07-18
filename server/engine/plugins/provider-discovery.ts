/** Provider discovery. 移植自 openclaw/src/plugins/provider-discovery.ts。
 * 降级策略：返回空/默认值。 */
export type ResolveRuntimePluginDiscoveryProvidersParams = {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
};
export type ResolveInstalledPluginProviderContributionIdsParams = unknown;
export function resolveInstalledPluginProviderContributionIds(params: unknown): string[] {
  void params;
  return [];
}
export async function resolveRuntimePluginDiscoveryProviders(params: unknown): Promise<unknown[]> {
  void params;
  return [];
}
export function groupPluginDiscoveryProvidersByOrder(params: unknown): unknown {
  void params;
  return {};
}
export function providerMatchesFilter(params: unknown): boolean {
  void params;
  return false;
}
export function normalizePluginDiscoveryResult(params: unknown): unknown {
  void params;
  return undefined;
}
export function runProviderCatalog(params: unknown): unknown {
  void params;
  return undefined;
}
export function runProviderStaticCatalog(params: unknown): unknown {
  void params;
  return undefined;
}
