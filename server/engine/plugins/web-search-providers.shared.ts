/**
 * Web search providers shared helpers.
 * 移植自 openclaw/src/plugins/web-search-providers.shared.ts。
 * 降级策略：返回空数组。
 */
export function sortWebSearchProviders(providers: any[]): any[] {
  return providers;
}

export function sortWebSearchProvidersForAutoDetect(providers: any[]): any[] {
  return providers;
}

export function resolveBundledWebSearchResolutionConfig(params: {
  pluginDir: string;
}): any {
  void params;
  return undefined;
}
