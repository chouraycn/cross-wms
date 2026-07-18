/**
 * 移植自 openclaw/src/agents/subagent-session-reconciliation.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SubagentSessionStoreCache = unknown;
export type SubagentRunOrphanReason = unknown;
export type SubagentSessionCompletion = unknown;
export function loadSubagentSessionEntry(..._args: unknown[]): unknown {
  throw new Error("loadSubagentSessionEntry not implemented (openclaw stub)");
}
export function resolveSubagentRunOrphanReason(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentRunOrphanReason not implemented (openclaw stub)");
}
export function resolveCompletionFromSessionEntry(..._args: unknown[]): unknown {
  throw new Error("resolveCompletionFromSessionEntry not implemented (openclaw stub)");
}
export function resolveSubagentSessionCompletion(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentSessionCompletion not implemented (openclaw stub)");
}
export function resolveSubagentSessionStartedAt(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentSessionStartedAt not implemented (openclaw stub)");
}
