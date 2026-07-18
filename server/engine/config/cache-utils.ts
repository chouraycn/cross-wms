// 移植自 openclaw/src/config/cache-utils.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveCacheTtlMs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveCacheTtlMs");
}
export function isCacheEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isCacheEnabled");
}
export function createExpiringMapCache(...args: unknown[]): unknown {
  throw new Error("not implemented: createExpiringMapCache");
}
export function getFileStatSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: getFileStatSnapshot");
}
