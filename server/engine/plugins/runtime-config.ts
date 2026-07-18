// 移植自 openclaw/src/plugins/runtime-config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resetRuntimeConfigDeprecationWarningStateForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: resetRuntimeConfigDeprecationWarningStateForTest");
}
export function createRuntimeConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: createRuntimeConfig");
}
