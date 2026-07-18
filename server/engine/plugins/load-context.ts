// 移植自 openclaw/src/plugins/load-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginRuntimeLoadContext = unknown;
export type PluginRuntimeResolvedLoadValues = unknown;
export type PluginRuntimeLoadContextOptions = unknown;
export function createPluginRuntimeLoaderLogger(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginRuntimeLoaderLogger");
}
export function resolvePluginRuntimeLoadContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRuntimeLoadContext");
}
export function buildPluginRuntimeLoadOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginRuntimeLoadOptions");
}
export function buildPluginRuntimeLoadOptionsFromValues(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginRuntimeLoadOptionsFromValues");
}
