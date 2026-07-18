// 移植自 openclaw/src/config/normalize-exec-safe-bin.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeExecSafeBinProfilesInConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeExecSafeBinProfilesInConfig");
}
