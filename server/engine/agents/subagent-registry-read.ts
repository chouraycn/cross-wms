/**
 * 移植自 openclaw/src/agents/subagent-registry-read.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { getSubagentSessionRuntimeMs, getSubagentSessionStartedAt, resolveSubagentSessionStatus } from "./subagent-session-metrics.js";
export function buildSubagentRunReadIndex(..._args: unknown[]): unknown {
  throw new Error("buildSubagentRunReadIndex not implemented (openclaw stub)");
}
export function listSubagentRunsForController(..._args: unknown[]): unknown {
  throw new Error("listSubagentRunsForController not implemented (openclaw stub)");
}
export function countActiveDescendantRuns(..._args: unknown[]): unknown {
  throw new Error("countActiveDescendantRuns not implemented (openclaw stub)");
}
export function listDescendantRunsForRequester(..._args: unknown[]): unknown {
  throw new Error("listDescendantRunsForRequester not implemented (openclaw stub)");
}
export function getSubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  throw new Error("getSubagentRunByChildSessionKey not implemented (openclaw stub)");
}
export function isSubagentRunLive(..._args: unknown[]): unknown {
  throw new Error("isSubagentRunLive not implemented (openclaw stub)");
}
export function getSessionDisplaySubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  throw new Error("getSessionDisplaySubagentRunByChildSessionKey not implemented (openclaw stub)");
}
export function getLatestSubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  throw new Error("getLatestSubagentRunByChildSessionKey not implemented (openclaw stub)");
}
