/**
 * Web provider public artifacts.
 * 移植自 openclaw/src/plugins/web-provider-public-artifacts.ts。
 * 降级策略：返回空。
 */
export function resolveBundledWebSearchProvidersFromPublicArtifacts(params: {
  pluginDir: string;
}): unknown[] {
  void params;
  return [];
}

export function resolveBundledWebFetchProvidersFromPublicArtifacts(params: {
  pluginDir: string;
}): unknown[] {
  void params;
  return [];
}
