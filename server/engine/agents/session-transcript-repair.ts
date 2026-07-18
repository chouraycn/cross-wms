/**
 * 移植自 openclaw/src/agents/session-transcript-repair.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function stripToolResultDetails(..._args: unknown[]): unknown {
  throw new Error("stripToolResultDetails not implemented (openclaw stub)");
}
export function sanitizeToolCallInputs(..._args: unknown[]): unknown {
  throw new Error("sanitizeToolCallInputs not implemented (openclaw stub)");
}
export function sanitizeToolUseResultPairing(..._args: unknown[]): unknown {
  throw new Error("sanitizeToolUseResultPairing not implemented (openclaw stub)");
}
export function repairToolUseResultPairing(..._args: unknown[]): unknown {
  throw new Error("repairToolUseResultPairing not implemented (openclaw stub)");
}
