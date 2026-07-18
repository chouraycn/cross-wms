// 移植自 openclaw/src/infra/install-target.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveCanonicalInstallTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveCanonicalInstallTarget");
}
export function ensureInstallTargetAvailable(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureInstallTargetAvailable");
}
