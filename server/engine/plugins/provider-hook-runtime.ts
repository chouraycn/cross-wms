/** Provider hook runtime. 移植自 openclaw/src/plugins/provider-hook-runtime.ts。
 * 降级策略：返回 undefined/空。 */
import type { ProviderPlugin } from './types.js';

export type ProviderRuntimePluginLookupParams = {
  providerId?: string;
  pluginId?: string;
  provider?: string;
  config?: any;
  workspaceDir?: string;
  env?: Record<string, string | undefined>;
  applyAutoEnable?: boolean;
  bundledProviderVitestCompat?: boolean;
};
export type ProviderRuntimePluginHandle = ProviderRuntimePluginLookupParams & {
  plugin?: any;
};
export type ProviderRuntimePluginHandleParams = ProviderRuntimePluginLookupParams & {
  config?: any;
};
export function clearProviderRuntimePluginCacheForTest(): void {
  // 降级
}
export function resolveProviderPluginsForHooks(params: any): any[] {
  void params;
  return [];
}
export function resolveProviderRuntimePlugin(
  params: ProviderRuntimePluginLookupParams,
): ProviderPlugin | undefined {
  void params;
  return undefined;
}
export function resolveLoadedProviderRuntimePlugin(params: any): ProviderPlugin | undefined {
  void params;
  return undefined;
}
export function resolveProviderHookPlugin(params: any): ProviderPlugin | undefined {
  void params;
  return undefined;
}
export function resolveProviderRuntimePluginHandle(params: any): ProviderRuntimePluginHandle | undefined {
  void params;
  return undefined;
}
export function ensureProviderRuntimePluginHandle(params: any): ProviderRuntimePluginHandle | undefined {
  void params;
  return undefined;
}
export function prepareProviderExtraParams(params: any): any {
  void params;
  return undefined;
}
export function resolveProviderExtraParamsForTransport(params: any): any {
  void params;
  return undefined;
}
export function resolveProviderAuthProfileId(params: any): string | undefined {
  void params;
  return undefined;
}
export function resolveProviderFollowupFallbackRoute(params: any): any {
  void params;
  return undefined;
}
export function wrapProviderStreamFn(params: any): any {
  void params;
  return undefined;
}
export function wrapProviderSimpleCompletionStreamFn(params: any): any {
  void params;
  return undefined;
}
