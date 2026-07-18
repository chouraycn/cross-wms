/**
 * 移植自 openclaw/src/agents/main-session-restart-recovery.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export async function markRestartAbortedMainSessions(..._args: unknown[]): Promise<unknown> {
  throw new Error("markRestartAbortedMainSessions not implemented (openclaw stub)");
}
export async function markStartupOrphanedMainSessionsForRecovery(..._args: unknown[]): Promise<unknown> {
  throw new Error("markStartupOrphanedMainSessionsForRecovery not implemented (openclaw stub)");
}
export async function markRestartAbortedMainSessionsFromLocks(..._args: unknown[]): Promise<unknown> {
  throw new Error("markRestartAbortedMainSessionsFromLocks not implemented (openclaw stub)");
}
export async function recoverRestartAbortedMainSessions(..._args: unknown[]): Promise<unknown> {
  throw new Error("recoverRestartAbortedMainSessions not implemented (openclaw stub)");
}
export async function recoverStartupOrphanedMainSessions(..._args: unknown[]): Promise<unknown> {
  throw new Error("recoverStartupOrphanedMainSessions not implemented (openclaw stub)");
}
export function scheduleRestartAbortedMainSessionRecovery(..._args: unknown[]): unknown {
  throw new Error("scheduleRestartAbortedMainSessionRecovery not implemented (openclaw stub)");
}
