/**
 * 移植自 openclaw/src/agents/subagent-run-liveness.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS: unknown = undefined;
export function hasSubagentRunEnded(..._args: unknown[]): unknown {
  throw new Error("hasSubagentRunEnded not implemented (openclaw stub)");
}
export function isStaleUnendedSubagentRun(..._args: unknown[]): unknown {
  throw new Error("isStaleUnendedSubagentRun not implemented (openclaw stub)");
}
export function isLiveUnendedSubagentRun(..._args: unknown[]): unknown {
  throw new Error("isLiveUnendedSubagentRun not implemented (openclaw stub)");
}
export function shouldKeepSubagentRunChildLink(..._args: unknown[]): unknown {
  throw new Error("shouldKeepSubagentRunChildLink not implemented (openclaw stub)");
}
