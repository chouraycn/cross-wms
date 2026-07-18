// 移植自 openclaw/src/plugins/runtime-plugin-boundary.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function readPluginBoundaryConfigSafely(...args: unknown[]): unknown {
  throw new Error("not implemented: readPluginBoundaryConfigSafely");
}
export function resolvePluginRuntimeRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRuntimeRecord");
}
export function resolvePluginRuntimeRecordByEntryBaseNames(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRuntimeRecordByEntryBaseNames");
}
export function resolvePluginRuntimeModulePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRuntimeModulePath");
}
export function loadPluginBoundaryModule(...args: unknown[]): unknown {
  throw new Error("not implemented: loadPluginBoundaryModule");
}
