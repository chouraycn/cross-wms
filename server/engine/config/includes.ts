// 移植自 openclaw/src/config/includes.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type IncludeResolver = unknown;
export function hashConfigIncludeRaw(...args: unknown[]): unknown {
  throw new Error("not implemented: hashConfigIncludeRaw");
}
export function resolveConfigIncludeWritePath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigIncludeWritePath");
}
export function deepMerge(...args: unknown[]): unknown {
  throw new Error("not implemented: deepMerge");
}
export function readConfigIncludeFileWithGuards(...args: unknown[]): unknown {
  throw new Error("not implemented: readConfigIncludeFileWithGuards");
}
export function resolveConfigIncludes(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigIncludes");
}
export const INCLUDE_KEY: unknown = undefined;
export const MAX_INCLUDE_DEPTH: unknown = undefined;
export const MAX_INCLUDE_FILE_BYTES: unknown = undefined;
export const MAX_INCLUDE_PATH_LENGTH: unknown = undefined;
export class ConfigIncludeError {
  constructor(...args: unknown[]) { throw new Error("not implemented: ConfigIncludeError"); }
}
export class CircularIncludeError {
  constructor(...args: unknown[]) { throw new Error("not implemented: CircularIncludeError"); }
}
