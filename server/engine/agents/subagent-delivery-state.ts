/**
 * 移植自 openclaw/src/agents/subagent-delivery-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type LegacySubagentRunRecord = unknown;
export function normalizeSubagentRunState(..._args: unknown[]): unknown {
  throw new Error("normalizeSubagentRunState not implemented (openclaw stub)");
}
export function ensureCompletionState(..._args: unknown[]): unknown {
  throw new Error("ensureCompletionState not implemented (openclaw stub)");
}
export function ensureDeliveryState(..._args: unknown[]): unknown {
  throw new Error("ensureDeliveryState not implemented (openclaw stub)");
}
export function clearDeliveryState(..._args: unknown[]): unknown {
  throw new Error("clearDeliveryState not implemented (openclaw stub)");
}
export function isDeliverySuspended(..._args: unknown[]): unknown {
  throw new Error("isDeliverySuspended not implemented (openclaw stub)");
}
export function getDeliveryAttemptCount(..._args: unknown[]): unknown {
  throw new Error("getDeliveryAttemptCount not implemented (openclaw stub)");
}
export function getDeliveryLastAttemptAt(..._args: unknown[]): unknown {
  throw new Error("getDeliveryLastAttemptAt not implemented (openclaw stub)");
}
export function getDeliveryLastError(..._args: unknown[]): unknown {
  throw new Error("getDeliveryLastError not implemented (openclaw stub)");
}
