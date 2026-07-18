// 移植自 openclaw/src/infra/exec-safe-bin-trust.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type WritableTrustedSafeBinDir = unknown;
export function normalizeTrustedSafeBinDirs(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeTrustedSafeBinDirs");
}
export function getTrustedSafeBinDirs(...args: unknown[]): unknown {
  throw new Error("not implemented: getTrustedSafeBinDirs");
}
export function isTrustedSafeBinPath(...args: unknown[]): unknown {
  throw new Error("not implemented: isTrustedSafeBinPath");
}
export function listWritableExplicitTrustedSafeBinDirs(...args: unknown[]): unknown {
  throw new Error("not implemented: listWritableExplicitTrustedSafeBinDirs");
}
