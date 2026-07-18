/**
 * 移植自 openclaw/src/agents/command/attempt-execution.shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function persistSessionEntry(..._args: unknown[]): unknown {
  throw new Error("persistSessionEntry not implemented (openclaw stub)");
}
export function prependInternalEventContext(..._args: unknown[]): unknown {
  throw new Error("prependInternalEventContext not implemented (openclaw stub)");
}
export function resolveAcpPromptBody(..._args: unknown[]): unknown {
  throw new Error("resolveAcpPromptBody not implemented (openclaw stub)");
}
export function resolveInternalEventTranscriptBody(..._args: unknown[]): unknown {
  throw new Error("resolveInternalEventTranscriptBody not implemented (openclaw stub)");
}
