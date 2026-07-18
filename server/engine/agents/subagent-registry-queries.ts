/**
 * 移植自 openclaw/src/agents/subagent-registry-queries.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SubagentRunReadIndex = unknown;
export function listRunsForRequesterFromRuns(..._args: unknown[]): unknown {
  throw new Error("listRunsForRequesterFromRuns not implemented (openclaw stub)");
}
export function listRunsForControllerFromRuns(..._args: unknown[]): unknown {
  throw new Error("listRunsForControllerFromRuns not implemented (openclaw stub)");
}
export function buildSubagentRunReadIndexFromRuns(..._args: unknown[]): unknown {
  throw new Error("buildSubagentRunReadIndexFromRuns not implemented (openclaw stub)");
}
export function isSubagentSessionRunActiveFromRuns(..._args: unknown[]): unknown {
  throw new Error("isSubagentSessionRunActiveFromRuns not implemented (openclaw stub)");
}
export function getSubagentRunByChildSessionKeyFromRuns(..._args: unknown[]): unknown {
  throw new Error("getSubagentRunByChildSessionKeyFromRuns not implemented (openclaw stub)");
}
export function resolveRequesterForChildSessionFromRuns(..._args: unknown[]): unknown {
  throw new Error("resolveRequesterForChildSessionFromRuns not implemented (openclaw stub)");
}
export function shouldIgnorePostCompletionAnnounceForSessionFromRuns(..._args: unknown[]): unknown {
  throw new Error("shouldIgnorePostCompletionAnnounceForSessionFromRuns not implemented (openclaw stub)");
}
export function countActiveRunsForSessionFromRuns(..._args: unknown[]): unknown {
  throw new Error("countActiveRunsForSessionFromRuns not implemented (openclaw stub)");
}
export function countActiveDescendantRunsFromRuns(..._args: unknown[]): unknown {
  throw new Error("countActiveDescendantRunsFromRuns not implemented (openclaw stub)");
}
export function countPendingDescendantRunsFromRuns(..._args: unknown[]): unknown {
  throw new Error("countPendingDescendantRunsFromRuns not implemented (openclaw stub)");
}
export function countPendingDescendantRunsExcludingRunFromRuns(..._args: unknown[]): unknown {
  throw new Error("countPendingDescendantRunsExcludingRunFromRuns not implemented (openclaw stub)");
}
export function listDescendantRunsForRequesterFromRuns(..._args: unknown[]): unknown {
  throw new Error("listDescendantRunsForRequesterFromRuns not implemented (openclaw stub)");
}
