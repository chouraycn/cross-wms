/**
 * 移植自 openclaw/src/agents/tool-loop-detection.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const TOOL_CALL_HISTORY_SIZE: unknown = undefined;
export const WARNING_THRESHOLD: unknown = undefined;
export const UNKNOWN_TOOL_THRESHOLD: unknown = undefined;
export const CRITICAL_THRESHOLD: unknown = undefined;
export const GLOBAL_CIRCUIT_BREAKER_THRESHOLD: unknown = undefined;
export function hashToolCall(..._args: unknown[]): unknown {
  return false;
}
export function detectToolCallLoop(..._args: unknown[]): unknown {
  return undefined;
}
export function recordToolCall(..._args: unknown[]): unknown {
  return undefined;
}
export function recordToolCallOutcome(..._args: unknown[]): unknown {
  return undefined;
}
