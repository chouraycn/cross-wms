/**
 * Web fetch providers runtime.
 * 移植自 openclaw/src/plugins/web-fetch-providers.runtime.ts。
 * 降级策略：返回空。
 */
export function resolvePluginWebFetchProviders(params: {
  config?: any;
  env?: NodeJS.ProcessEnv;
}): any[] {
  void params;
  return [];
}

export function resolveRuntimeWebFetchProviders(params: {
  config?: any;
  env?: NodeJS.ProcessEnv;
}): any[] {
  void params;
  return [];
}
