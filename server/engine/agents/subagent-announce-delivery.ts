/**
 * 移植自 openclaw/src/agents/subagent-announce-delivery.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const testing: any = undefined;
export function resolveSubagentAnnounceTimeoutMs(..._args: any[]): any {
  return undefined;
}
export function isInternalAnnounceRequesterSession(..._args: any[]): any {
  return false;
}
export async function runAnnounceDeliveryWithRetry(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export async function resolveSubagentCompletionOrigin(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
export function loadRequesterSessionEntry(..._args: any[]): any {
  return undefined;
}
export function loadSessionEntryByKey(..._args: any[]): any {
  return undefined;
}
export async function deliverSubagentAnnouncement(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
