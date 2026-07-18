// 移植自 openclaw/src/config/patch-replace-paths.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeConfigPatchReplacePath(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfigPatchReplacePath");
}
export function normalizeConfigPatchReplacePaths(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfigPatchReplacePaths");
}
