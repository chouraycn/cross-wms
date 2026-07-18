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
  throw new Error("capFrozenResultText not implemented (openclaw stub)");
}
export function resolveAnnounceRetryDelayMs(..._args: unknown[]): unknown {
  throw new Error("resolveAnnounceRetryDelayMs not implemented (openclaw stub)");
}
export function logAnnounceGiveUp(..._args: unknown[]): unknown {
  throw new Error("logAnnounceGiveUp not implemented (openclaw stub)");
}
export async function persistSubagentSessionTiming(..._args: unknown[]): Promise<unknown> {
  throw new Error("persistSubagentSessionTiming not implemented (openclaw stub)");
}
export async function safeRemoveAttachmentsDir(..._args: unknown[]): Promise<unknown> {
  throw new Error("safeRemoveAttachmentsDir not implemented (openclaw stub)");
}
export function reconcileOrphanedRun(..._args: unknown[]): unknown {
  throw new Error("reconcileOrphanedRun not implemented (openclaw stub)");
}
export function reconcileOrphanedRestoredRuns(..._args: unknown[]): unknown {
  throw new Error("reconcileOrphanedRestoredRuns not implemented (openclaw stub)");
}
export function resolveArchiveAfterMs(..._args: unknown[]): unknown {
  throw new Error("resolveArchiveAfterMs not implemented (openclaw stub)");
}
