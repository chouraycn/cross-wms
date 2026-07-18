// 移植自 openclaw/src/plugins/runtime-registry-loader.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginRegistryScope = unknown;
export function ensurePluginRegistryLoaded(...args: unknown[]): unknown {
  throw new Error("not implemented: ensurePluginRegistryLoaded");
}
export const testing_runtime_registry_loader: unknown = undefined;
export type __testing_runtime_registry_loader = unknown;
