// 移植自 openclaw/src/config/state-dir-dotenv.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type DurableServiceEnvVarSources = unknown;
export function isUnresolvedShellReference(...args: unknown[]): unknown {
  throw new Error("not implemented: isUnresolvedShellReference");
}
export function readStateDirDotEnvFromStateDir(...args: unknown[]): unknown {
  throw new Error("not implemented: readStateDirDotEnvFromStateDir");
}
export function readStateDirDotEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: readStateDirDotEnvVars");
}
export function collectDurableServiceEnvVarSources(...args: unknown[]): unknown {
  throw new Error("not implemented: collectDurableServiceEnvVarSources");
}
export function collectDurableServiceEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: collectDurableServiceEnvVars");
}
