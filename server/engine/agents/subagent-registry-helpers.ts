/**
 * 移植自 openclaw/src/agents/subagent-registry-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { getSubagentSessionRuntimeMs, getSubagentSessionStartedAt, resolveSubagentSessionStatus } from "./subagent-session-metrics.js";
export const MIN_ANNOUNCE_RETRY_DELAY_MS: unknown = undefined;
export const MAX_ANNOUNCE_RETRY_COUNT: unknown = undefined;
export const ANNOUNCE_EXPIRY_MS: unknown = undefined;
export const ANNOUNCE_COMPLETION_HARD_EXPIRY_MS: unknown = undefined;
export function capFrozenResultText(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveAnnounceRetryDelayMs(..._args: unknown[]): unknown {
  return undefined;
}
export function logAnnounceGiveUp(..._args: unknown[]): unknown {
  return undefined;
}
export async function persistSubagentSessionTiming(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function safeRemoveAttachmentsDir(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function reconcileOrphanedRun(..._args: unknown[]): unknown {
  return undefined;
}
export function reconcileOrphanedRestoredRuns(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveArchiveAfterMs(..._args: unknown[]): unknown {
  return undefined;
}
