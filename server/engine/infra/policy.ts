// 移植自 openclaw/src/infra/policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CommandPolicyAnalysis = unknown;
export function analyzeCommandForPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: analyzeCommandForPolicy");
}
export function detectPolicyInlineEval(...args: unknown[]): unknown {
  throw new Error("not implemented: detectPolicyInlineEval");
}
