// 移植自 openclaw/src/config/runtime-source-projection.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function projectConfigOntoRuntimeSourceSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: projectConfigOntoRuntimeSourceSnapshot");
}
