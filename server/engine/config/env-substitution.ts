// 移植自 openclaw/src/config/env-substitution.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type EnvSubstitutionWarning = unknown;
export function containsEnvVarReference(...args: unknown[]): unknown {
  throw new Error("not implemented: containsEnvVarReference");
}
export function resolveConfigEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigEnvVars");
}
export class MissingEnvVarError {
  constructor(...args: unknown[]) { throw new Error("not implemented: MissingEnvVarError"); }
}
