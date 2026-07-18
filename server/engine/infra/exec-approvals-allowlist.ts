// 移植自 openclaw/src/infra/exec-approvals-allowlist.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExecAllowlistEvaluation = unknown;
export type ExecSegmentSatisfiedBy = unknown;
export type SkillBinTrustEntry = unknown;
export type ExecAllowlistAnalysis = unknown;
export type AllowAlwaysPattern = unknown;
export function normalizeSafeBins(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeSafeBins");
}
export function resolveSafeBins(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSafeBins");
}
export function isSafeBinUsage(...args: unknown[]): unknown {
  throw new Error("not implemented: isSafeBinUsage");
}
export function evaluateExecAllowlist(...args: unknown[]): unknown {
  throw new Error("not implemented: evaluateExecAllowlist");
}
export function resolveAllowAlwaysPatternEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowAlwaysPatternEntries");
}
export function resolveAllowAlwaysPatterns(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowAlwaysPatterns");
}
export function evaluateShellAllowlist(...args: unknown[]): unknown {
  throw new Error("not implemented: evaluateShellAllowlist");
}
export function evaluateShellAllowlistWithAuthorization(...args: unknown[]): unknown {
  throw new Error("not implemented: evaluateShellAllowlistWithAuthorization");
}
export function evaluateExecAllowlistWithAuthorization(...args: unknown[]): unknown {
  throw new Error("not implemented: evaluateExecAllowlistWithAuthorization");
}
