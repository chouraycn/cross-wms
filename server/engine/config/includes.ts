// 移植自 openclaw/src/config/includes.ts

export type IncludeResolver = unknown;
export function hashConfigIncludeRaw(...args: any[]): any {
  return false;
}
export function resolveConfigIncludeWritePath(...args: any[]): any {
  return undefined;
}
export function deepMerge(...args: any[]): any {
  return undefined;
}
export function readConfigIncludeFileWithGuards(...args: any[]): any {
  return undefined;
}
export function resolveConfigIncludes(...args: any[]): any {
  return undefined;
}
export const INCLUDE_KEY: any = undefined as any;
export const MAX_INCLUDE_DEPTH: any = undefined as any;
export const MAX_INCLUDE_FILE_BYTES: any = undefined as any;
export const MAX_INCLUDE_PATH_LENGTH: any = undefined as any;
export class ConfigIncludeError {
  // Stub: not fully ported
}
export class CircularIncludeError {
  // Stub: not fully ported
}
