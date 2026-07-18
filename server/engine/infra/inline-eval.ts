// 移植自 openclaw/src/infra/inline-eval.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type InterpreterInlineEvalHit = unknown;
export function detectInterpreterInlineEvalArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: detectInterpreterInlineEvalArgv");
}
export function describeInterpreterInlineEval(...args: unknown[]): unknown {
  throw new Error("not implemented: describeInterpreterInlineEval");
}
export function isInterpreterLikeAllowlistPattern(...args: unknown[]): unknown {
  throw new Error("not implemented: isInterpreterLikeAllowlistPattern");
}
