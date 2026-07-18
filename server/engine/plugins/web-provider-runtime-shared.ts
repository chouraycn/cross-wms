/**
 * Web provider runtime shared helpers.
 * 移植自 openclaw/src/plugins/web-provider-runtime-shared.ts。
 * 降级策略：返回空。
 */
export type ResolvePluginWebProvidersParams = {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
};

export function resolvePluginWebProviders<TEntry>(params: ResolvePluginWebProvidersParams): TEntry[] {
  void params;
  return [];
}

export function resolveRuntimeWebProviders<TEntry>(params: ResolvePluginWebProvidersParams): TEntry[] {
  void params;
  return [];
}
