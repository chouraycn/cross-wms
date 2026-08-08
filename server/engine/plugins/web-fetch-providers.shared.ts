/**
 * Web fetch providers shared helpers.
 * 移植自 openclaw/src/plugins/web-fetch-providers.shared.ts。
 * 降级策略：返回空数组。
 */
export function sortWebFetchProviders(providers: any[]): any[] {
  return providers;
}

export function sortWebFetchProvidersForAutoDetect(providers: any[]): any[] {
  return providers;
}

export function resolveBundledWebFetchResolutionConfig(params: {
  pluginDir: string;
}): any {
  void params;
  return undefined;
}
