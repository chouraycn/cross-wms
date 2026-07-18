// 移植自 openclaw/src/infra/diagnostic-flags.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveDiagnosticFlags(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDiagnosticFlags");
}
export function matchesDiagnosticFlag(...args: unknown[]): unknown {
  throw new Error("not implemented: matchesDiagnosticFlag");
}
export function isDiagnosticFlagEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isDiagnosticFlagEnabled");
}
