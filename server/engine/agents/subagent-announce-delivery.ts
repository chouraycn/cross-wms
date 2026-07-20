/**
 * 移植自 openclaw/src/agents/subagent-announce-delivery.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const testing: unknown = undefined;
export function resolveSubagentAnnounceTimeoutMs(..._args: unknown[]): unknown {
  return undefined;
}
export function isInternalAnnounceRequesterSession(..._args: unknown[]): unknown {
  return false;
}
export async function runAnnounceDeliveryWithRetry(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function resolveSubagentCompletionOrigin(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function loadRequesterSessionEntry(..._args: unknown[]): unknown {
  return undefined;
}
export function loadSessionEntryByKey(..._args: unknown[]): unknown {
  return undefined;
}
export async function deliverSubagentAnnouncement(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
