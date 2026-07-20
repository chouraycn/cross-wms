// 移植自 openclaw/src/config/config-env-vars.ts

export function isConfigRuntimeEnvVarAllowed(...args: unknown[]): unknown {
  return false;
}
export function cloneEnvWithPlatformSemantics(...args: unknown[]): unknown {
  return undefined;
}
export function collectConfigRuntimeEnvVars(...args: unknown[]): unknown {
  return [];
}
export function collectConfigServiceEnvVars(...args: unknown[]): unknown {
  return [];
}
export function createConfigRuntimeEnv(...args: unknown[]): unknown {
  return undefined;
}
export function applyConfigEnvVars(...args: unknown[]): unknown {
  return undefined;
}
