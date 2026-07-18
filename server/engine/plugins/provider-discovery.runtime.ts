/** Provider discovery runtime. 移植自 openclaw/src/plugins/provider-discovery.runtime.ts。
 * 降级策略：返回空。 */
export function clearProviderDiscoveryModuleLoaders(): void {
  // 降级
}
export function resolvePluginDiscoveryProvidersRuntime(params: unknown): unknown[] {
  void params;
  return [];
}
