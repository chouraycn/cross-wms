// 移植自 openclaw/src/config/env-substitution.ts

export type EnvSubstitutionWarning = unknown;
export function containsEnvVarReference(...args: any[]): any {
  return undefined;
}
export function resolveConfigEnvVars(...args: any[]): any {
  return undefined;
}
export class MissingEnvVarError {
  // Stub: not fully ported
}
