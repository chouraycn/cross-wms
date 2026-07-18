// 移植自 openclaw/src/config/env-preserve.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function restoreEnvVarRefs(...args: unknown[]): unknown {
  throw new Error("not implemented: restoreEnvVarRefs");
}
export class EnvRefArrayMutationError {
  constructor(...args: unknown[]) { throw new Error("not implemented: EnvRefArrayMutationError"); }
}
