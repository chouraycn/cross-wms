/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/preemptive-compaction.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type PreemptiveCompactionDecision = unknown;
export type LlmBoundaryTokenPressure = unknown;
export function estimateLlmBoundaryTokenPressure(..._args: unknown[]): unknown {
  return undefined;
}
export function estimateRenderedLlmBoundaryTokenPressure(..._args: unknown[]): unknown {
  return undefined;
}
export function shouldPreemptivelyCompactBeforePrompt(..._args: unknown[]): unknown {
  return false;
}
export function formatPrePromptPrecheckLog(..._args: unknown[]): unknown {
  return "";
}
export function buildPrePromptContextBudgetStatus(..._args: unknown[]): unknown {
  return undefined;
}
export const PREEMPTIVE_OVERFLOW_ERROR_TEXT: unknown = undefined;
