/**
 * 移植自 openclaw/src/agents/subagent-announce-delivery.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const testing: unknown = undefined;
export function resolveSubagentAnnounceTimeoutMs(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentAnnounceTimeoutMs not implemented (openclaw stub)");
}
export function isInternalAnnounceRequesterSession(..._args: unknown[]): unknown {
  throw new Error("isInternalAnnounceRequesterSession not implemented (openclaw stub)");
}
export async function runAnnounceDeliveryWithRetry(..._args: unknown[]): Promise<unknown> {
  throw new Error("runAnnounceDeliveryWithRetry not implemented (openclaw stub)");
}
export async function resolveSubagentCompletionOrigin(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveSubagentCompletionOrigin not implemented (openclaw stub)");
}
export function loadRequesterSessionEntry(..._args: unknown[]): unknown {
  throw new Error("loadRequesterSessionEntry not implemented (openclaw stub)");
}
export function loadSessionEntryByKey(..._args: unknown[]): unknown {
  throw new Error("loadSessionEntryByKey not implemented (openclaw stub)");
}
export async function deliverSubagentAnnouncement(..._args: unknown[]): Promise<unknown> {
  throw new Error("deliverSubagentAnnouncement not implemented (openclaw stub)");
}
