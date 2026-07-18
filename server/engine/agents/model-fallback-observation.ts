/**
 * 移植自 openclaw/src/agents/model-fallback-observation.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ModelFallbackStepFields = unknown;
export type ModelFallbackDecisionParams = unknown;
export function isModelFallbackDecisionLogEnabled(..._args: unknown[]): unknown {
  throw new Error("isModelFallbackDecisionLogEnabled not implemented (openclaw stub)");
}
export function resetModelFallbackDecisionLogCoalescingForTest(..._args: unknown[]): unknown {
  throw new Error("resetModelFallbackDecisionLogCoalescingForTest not implemented (openclaw stub)");
}
export function logModelFallbackDecision(..._args: unknown[]): unknown {
  throw new Error("logModelFallbackDecision not implemented (openclaw stub)");
}
