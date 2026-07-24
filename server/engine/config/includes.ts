// 移植自 openclaw/src/config/includes.ts

export type IncludeResolver = unknown;
export function hashConfigIncludeRaw(...args: unknown[]): unknown {
  return false;
}
export function resolveConfigIncludeWritePath(...args: unknown[]): unknown {
  return undefined;
}
export function deepMerge(...args: unknown[]): unknown {
  return undefined;
}
export function readConfigIncludeFileWithGuards(...args: unknown[]): unknown {
  return undefined;
}
export function resolveConfigIncludes(...args: unknown[]): unknown {
  return undefined;
}
export const INCLUDE_KEY: unknown = undefined as unknown;
export const MAX_INCLUDE_DEPTH: unknown = undefined as unknown;
export const MAX_INCLUDE_FILE_BYTES: unknown = undefined as unknown;
export const MAX_INCLUDE_PATH_LENGTH: unknown = undefined as unknown;
export class ConfigIncludeError {
  // Stub: not fully ported
}
export class CircularIncludeError {
  // Stub: not fully ported
}
