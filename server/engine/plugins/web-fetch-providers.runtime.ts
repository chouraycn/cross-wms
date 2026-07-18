/**
 * Web fetch providers runtime.
 * 移植自 openclaw/src/plugins/web-fetch-providers.runtime.ts。
 * 降级策略：返回空。
 */
export function resolvePluginWebFetchProviders(params: {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
}): unknown[] {
  void params;
  return [];
}

export function resolveRuntimeWebFetchProviders(params: {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
}): unknown[] {
  void params;
  return [];
}
