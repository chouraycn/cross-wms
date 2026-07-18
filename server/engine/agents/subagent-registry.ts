/**
 * 移植自 openclaw/src/agents/subagent-registry.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { getSubagentSessionRuntimeMs, getSubagentSessionStartedAt, resolveSubagentSessionStatus } from "./subagent-registry-helpers.js";
export { listSessionMaintenanceProtectedSubagentSessionKeys } from "./subagent-registry-maintenance.js";
export type { SubagentRunRecord } from "./subagent-registry.types.js";
export const testing: unknown = undefined;
export function scheduleSubagentOrphanRecovery(..._args: unknown[]): unknown {
  throw new Error("scheduleSubagentOrphanRecovery not implemented (openclaw stub)");
}
export function markSubagentRunForSteerRestart(..._args: unknown[]): unknown {
  throw new Error("markSubagentRunForSteerRestart not implemented (openclaw stub)");
}
export function clearSubagentRunSteerRestart(..._args: unknown[]): unknown {
  throw new Error("clearSubagentRunSteerRestart not implemented (openclaw stub)");
}
export function replaceSubagentRunAfterSteer(..._args: unknown[]): unknown {
  throw new Error("replaceSubagentRunAfterSteer not implemented (openclaw stub)");
}
export function registerSubagentRun(..._args: unknown[]): unknown {
  throw new Error("registerSubagentRun not implemented (openclaw stub)");
}
export function resetSubagentRegistryForTests(..._args: unknown[]): unknown {
  throw new Error("resetSubagentRegistryForTests not implemented (openclaw stub)");
}
export function addSubagentRunForTests(..._args: unknown[]): unknown {
  throw new Error("addSubagentRunForTests not implemented (openclaw stub)");
}
export function releaseSubagentRun(..._args: unknown[]): unknown {
  throw new Error("releaseSubagentRun not implemented (openclaw stub)");
}
export async function finalizeInterruptedSubagentRun(..._args: unknown[]): Promise<unknown> {
  throw new Error("finalizeInterruptedSubagentRun not implemented (openclaw stub)");
}
export function resolveRequesterForChildSession(..._args: unknown[]): unknown {
  throw new Error("resolveRequesterForChildSession not implemented (openclaw stub)");
}
export function isSubagentSessionRunActive(..._args: unknown[]): unknown {
  throw new Error("isSubagentSessionRunActive not implemented (openclaw stub)");
}
export function shouldIgnorePostCompletionAnnounceForSession(..._args: unknown[]): unknown {
  throw new Error("shouldIgnorePostCompletionAnnounceForSession not implemented (openclaw stub)");
}
export function markSubagentRunTerminated(..._args: unknown[]): unknown {
  throw new Error("markSubagentRunTerminated not implemented (openclaw stub)");
}
export function listSubagentRunsForRequester(..._args: unknown[]): unknown {
  throw new Error("listSubagentRunsForRequester not implemented (openclaw stub)");
}
export function leasePendingAgentSteeringItems(..._args: unknown[]): unknown {
  throw new Error("leasePendingAgentSteeringItems not implemented (openclaw stub)");
}
export function ackPendingAgentSteeringItems(..._args: unknown[]): unknown {
  throw new Error("ackPendingAgentSteeringItems not implemented (openclaw stub)");
}
export function releasePendingAgentSteeringItems(..._args: unknown[]): unknown {
  throw new Error("releasePendingAgentSteeringItems not implemented (openclaw stub)");
}
export function listSubagentRunsForController(..._args: unknown[]): unknown {
  throw new Error("listSubagentRunsForController not implemented (openclaw stub)");
}
export function countActiveRunsForSession(..._args: unknown[]): unknown {
  throw new Error("countActiveRunsForSession not implemented (openclaw stub)");
}
export function countActiveDescendantRuns(..._args: unknown[]): unknown {
  throw new Error("countActiveDescendantRuns not implemented (openclaw stub)");
}
export function countPendingDescendantRuns(..._args: unknown[]): unknown {
  throw new Error("countPendingDescendantRuns not implemented (openclaw stub)");
}
export function countPendingDescendantRunsExcludingRun(..._args: unknown[]): unknown {
  throw new Error("countPendingDescendantRunsExcludingRun not implemented (openclaw stub)");
}
export function listDescendantRunsForRequester(..._args: unknown[]): unknown {
  throw new Error("listDescendantRunsForRequester not implemented (openclaw stub)");
}
export function getSubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  throw new Error("getSubagentRunByChildSessionKey not implemented (openclaw stub)");
}
export function getLatestSubagentRunByChildSessionKey(..._args: unknown[]): unknown {
  throw new Error("getLatestSubagentRunByChildSessionKey not implemented (openclaw stub)");
}
export function initSubagentRegistry(..._args: unknown[]): unknown {
  throw new Error("initSubagentRegistry not implemented (openclaw stub)");
}
