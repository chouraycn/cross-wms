/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compaction-hooks.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function runPostCompactionSideEffects(..._args: unknown[]): unknown {
  throw new Error("runPostCompactionSideEffects not implemented (openclaw stub)");
}
export function asCompactionHookRunner(..._args: unknown[]): unknown {
  throw new Error("asCompactionHookRunner not implemented (openclaw stub)");
}
export function buildBeforeCompactionHookMetrics(..._args: unknown[]): unknown {
  throw new Error("buildBeforeCompactionHookMetrics not implemented (openclaw stub)");
}
export function runBeforeCompactionHooks(..._args: unknown[]): unknown {
  throw new Error("runBeforeCompactionHooks not implemented (openclaw stub)");
}
export function estimateTokensAfterCompaction(..._args: unknown[]): unknown {
  throw new Error("estimateTokensAfterCompaction not implemented (openclaw stub)");
}
export function runAfterCompactionHooks(..._args: unknown[]): unknown {
  throw new Error("runAfterCompactionHooks not implemented (openclaw stub)");
}
