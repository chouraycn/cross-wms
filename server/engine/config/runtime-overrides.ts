// 移植自 openclaw/src/config/runtime-overrides.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getConfigOverrides(...args: unknown[]): unknown {
  throw new Error("not implemented: getConfigOverrides");
}
export function resetConfigOverrides(...args: unknown[]): unknown {
  throw new Error("not implemented: resetConfigOverrides");
}
export function setConfigOverride(...args: unknown[]): unknown {
  throw new Error("not implemented: setConfigOverride");
}
export function unsetConfigOverride(...args: unknown[]): unknown {
  throw new Error("not implemented: unsetConfigOverride");
}
export function applyConfigOverrides(...args: unknown[]): unknown {
  throw new Error("not implemented: applyConfigOverrides");
}
