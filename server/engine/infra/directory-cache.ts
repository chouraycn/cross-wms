// 移植自 openclaw/src/infra/directory-cache.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type DirectoryCacheKey = unknown;
export function buildDirectoryCacheKey(...args: unknown[]): unknown {
  throw new Error("not implemented: buildDirectoryCacheKey");
}
export class DirectoryCache {
  constructor(...args: unknown[]) { throw new Error("not implemented: DirectoryCache"); }
}
