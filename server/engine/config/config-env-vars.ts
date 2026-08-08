// 移植自 openclaw/src/config/config-env-vars.ts

export function isConfigRuntimeEnvVarAllowed(...args: any[]): any {
  return false;
}
export function cloneEnvWithPlatformSemantics(...args: any[]): any {
  return undefined;
}
export function collectConfigRuntimeEnvVars(...args: any[]): any {
  return [];
}
export function collectConfigServiceEnvVars(...args: any[]): any {
  return [];
}
export function createConfigRuntimeEnv(...args: any[]): any {
  return undefined;
}
export function applyConfigEnvVars(...args: any[]): any {
  return undefined;
}
