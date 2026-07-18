/** Providers runtime. 移植自 openclaw/src/plugins/providers.runtime.ts。
 * 降级策略：返回 false/空。 */
export function isPluginProvidersLoadInFlight(params: unknown): boolean {
  void params;
  return false;
}
export function resolvePluginProviders(params: unknown): unknown[] {
  void params;
  return [];
}
