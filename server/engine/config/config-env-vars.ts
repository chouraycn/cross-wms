// 移植自 openclaw/src/config/config-env-vars.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isConfigRuntimeEnvVarAllowed(...args: unknown[]): unknown {
  throw new Error("not implemented: isConfigRuntimeEnvVarAllowed");
}
export function cloneEnvWithPlatformSemantics(...args: unknown[]): unknown {
  throw new Error("not implemented: cloneEnvWithPlatformSemantics");
}
export function collectConfigRuntimeEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: collectConfigRuntimeEnvVars");
}
export function collectConfigServiceEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: collectConfigServiceEnvVars");
}
export function createConfigRuntimeEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: createConfigRuntimeEnv");
}
export function applyConfigEnvVars(...args: unknown[]): unknown {
  throw new Error("not implemented: applyConfigEnvVars");
}
