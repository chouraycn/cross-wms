// 移植自 openclaw/src/config/env-substitution.ts

export type EnvSubstitutionWarning = unknown;
export function containsEnvVarReference(...args: unknown[]): unknown {
  return undefined;
}
export function resolveConfigEnvVars(...args: unknown[]): unknown {
  return undefined;
}
export class MissingEnvVarError {
  // Stub: not fully ported
}
