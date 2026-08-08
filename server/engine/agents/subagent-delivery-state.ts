/**
 * 移植自 openclaw/src/agents/subagent-delivery-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type LegacySubagentRunRecord = unknown;
export function normalizeSubagentRunState(..._args: any[]): any {
  return undefined;
}
export function ensureCompletionState(..._args: any[]): any {
  return undefined;
}
export function ensureDeliveryState(..._args: any[]): any {
  return undefined;
}
export function clearDeliveryState(..._args: any[]): any {
  return undefined;
}
export function isDeliverySuspended(..._args: any[]): any {
  return false;
}
export function getDeliveryAttemptCount(..._args: any[]): any {
  return undefined;
}
export function getDeliveryLastAttemptAt(..._args: any[]): any {
  return undefined;
}
export function getDeliveryLastError(..._args: any[]): any {
  return undefined;
}
