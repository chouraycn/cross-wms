// 移植自 openclaw/src/config/dangerous-name-matching.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isDangerousNameMatchingEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isDangerousNameMatchingEnabled");
}
export function resolveDangerousNameMatchingEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDangerousNameMatchingEnabled");
}
export function collectProviderDangerousNameMatchingScopes(...args: unknown[]): unknown {
  throw new Error("not implemented: collectProviderDangerousNameMatchingScopes");
}
