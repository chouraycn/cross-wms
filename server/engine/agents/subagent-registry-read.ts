/**
 * 移植自 openclaw/src/agents/subagent-registry-read.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { getSubagentSessionRuntimeMs, getSubagentSessionStartedAt, resolveSubagentSessionStatus } from "./subagent-session-metrics.js";
export function buildSubagentRunReadIndex(..._args: unknown[]): unknown {
  return undefined;
}
export function listSubagentRunsForController(..._args: unknown[]): unknown {
  return [];
}
export function countActiveDescendantRuns(..._args: unknown[]): unknown {
  return undefined;
}
export function listDescendantRunsForRequester(..._args: unknown[]): unknown {
  return [];
}
export function getSubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  return undefined;
}
export function isSubagentRunLive(..._args: unknown[]): unknown {
  return false;
}
export function getSessionDisplaySubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  return undefined;
}
export function getLatestSubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  return undefined;
}
