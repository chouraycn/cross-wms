/**
 * 移植自 openclaw/src/agents/subagent-registry-runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { countActiveDescendantRuns, getLatestSubagentRunByChildSessionKey } from "./subagent-registry-read.js";
export { countPendingDescendantRuns, countPendingDescendantRunsExcludingRun, isSubagentSessionRunActive, listSubagentRunsForRequester, resolveRequesterForChildSession, shouldIgnorePostCompletionAnnounceForSession } from "./subagent-registry-announce-read.js";
export { replaceSubagentRunAfterSteer } from "./subagent-registry-steer-runtime.js";
