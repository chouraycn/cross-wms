// 移植自 openclaw/src/config/state-dir-dotenv.ts

export type DurableServiceEnvVarSources = unknown;
export function isUnresolvedShellReference(...args: unknown[]): unknown {
  return false;
}
export function readStateDirDotEnvFromStateDir(...args: unknown[]): unknown {
  return undefined;
}
export function readStateDirDotEnvVars(...args: unknown[]): unknown {
  return undefined;
}
export function collectDurableServiceEnvVarSources(...args: unknown[]): unknown {
  return [];
}
export function collectDurableServiceEnvVars(...args: unknown[]): unknown {
  return [];
}
