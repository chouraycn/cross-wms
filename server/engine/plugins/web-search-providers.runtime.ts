/**
 * Web search providers runtime.
 * 移植自 openclaw/src/plugins/web-search-providers.runtime.ts。
 * 降级策略：返回空。
 */
export function resolvePluginWebSearchProviders(params: {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
}): unknown[] {
  void params;
  return [];
}

export function resolveRuntimeWebSearchProviders(params: {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
}): unknown[] {
  void params;
  return [];
}
