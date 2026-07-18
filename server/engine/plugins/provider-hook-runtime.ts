/** Provider hook runtime. 移植自 openclaw/src/plugins/provider-hook-runtime.ts。
 * 降级策略：返回 undefined/空。 */
export type ProviderRuntimePluginLookupParams = {
  providerId?: string;
  pluginId?: string;
};
export type ProviderRuntimePluginHandle = ProviderRuntimePluginLookupParams & {
  plugin?: unknown;
};
export type ProviderRuntimePluginHandleParams = ProviderRuntimePluginLookupParams & {
  config?: unknown;
};
export function clearProviderRuntimePluginCacheForTest(): void {
  // 降级
}
export function resolveProviderPluginsForHooks(params: unknown): unknown[] {
  void params;
  return [];
}
export function resolveProviderRuntimePlugin(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveLoadedProviderRuntimePlugin(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveProviderHookPlugin(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveProviderRuntimePluginHandle(params: unknown): ProviderRuntimePluginHandle | undefined {
  void params;
  return undefined;
}
export function ensureProviderRuntimePluginHandle(params: unknown): ProviderRuntimePluginHandle | undefined {
  void params;
  return undefined;
}
export function prepareProviderExtraParams(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveProviderExtraParamsForTransport(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveProviderAuthProfileId(params: unknown): string | undefined {
  void params;
  return undefined;
}
export function resolveProviderFollowupFallbackRoute(params: unknown): unknown {
  void params;
  return undefined;
}
export function wrapProviderStreamFn(params: unknown): unknown {
  void params;
  return undefined;
}
export function wrapProviderSimpleCompletionStreamFn(params: unknown): unknown {
  void params;
  return undefined;
}
