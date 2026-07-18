/**
 * Web search providers shared helpers.
 * 移植自 openclaw/src/plugins/web-search-providers.shared.ts。
 * 降级策略：返回空数组。
 */
export function sortWebSearchProviders(providers: unknown[]): unknown[] {
  return providers;
}

export function sortWebSearchProvidersForAutoDetect(providers: unknown[]): unknown[] {
  return providers;
}

export function resolveBundledWebSearchResolutionConfig(params: {
  pluginDir: string;
}): unknown {
  void params;
  return undefined;
}
