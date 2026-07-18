// 移植自 openclaw/src/infra/exec-safe-bin-runtime-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isInterpreterLikeSafeBin(...args: unknown[]): unknown {
  throw new Error("not implemented: isInterpreterLikeSafeBin");
}
export function listInterpreterLikeSafeBins(...args: unknown[]): unknown {
  throw new Error("not implemented: listInterpreterLikeSafeBins");
}
export function resolveMergedSafeBinProfileFixtures(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMergedSafeBinProfileFixtures");
}
export function resolveExecSafeBinRuntimePolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExecSafeBinRuntimePolicy");
}
