/**
 * Web content extractors runtime.
 * 移植自 openclaw/src/plugins/web-content-extractors.runtime.ts。
 * 降级策略：返回空。
 */
export function resolvePluginWebContentExtractors(params?: {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
}): unknown[] {
  void params;
  return [];
}
