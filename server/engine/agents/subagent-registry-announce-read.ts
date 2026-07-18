/**
 * 移植自 openclaw/src/agents/subagent-registry-announce-read.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveRequesterForChildSession(..._args: unknown[]): unknown {
  throw new Error("resolveRequesterForChildSession not implemented (openclaw stub)");
}
export function isSubagentSessionRunActive(..._args: unknown[]): unknown {
  throw new Error("isSubagentSessionRunActive not implemented (openclaw stub)");
}
export function shouldIgnorePostCompletionAnnounceForSession(..._args: unknown[]): unknown {
  throw new Error("shouldIgnorePostCompletionAnnounceForSession not implemented (openclaw stub)");
}
export function listSubagentRunsForRequester(..._args: unknown[]): unknown {
  throw new Error("listSubagentRunsForRequester not implemented (openclaw stub)");
}
export function countPendingDescendantRuns(..._args: unknown[]): unknown {
  throw new Error("countPendingDescendantRuns not implemented (openclaw stub)");
}
export function countPendingDescendantRunsExcludingRun(..._args: unknown[]): unknown {
  throw new Error("countPendingDescendantRunsExcludingRun not implemented (openclaw stub)");
}
