// 移植自 openclaw/src/infra/install-flow.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveExistingInstallPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExistingInstallPath");
}
export function withExtractedArchiveRoot(...args: unknown[]): unknown {
  throw new Error("not implemented: withExtractedArchiveRoot");
}
