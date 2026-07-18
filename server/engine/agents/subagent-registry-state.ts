/**
 * 移植自 openclaw/src/agents/subagent-registry-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function clearSubagentRunsReadCacheForTest(..._args: unknown[]): unknown {
  throw new Error("clearSubagentRunsReadCacheForTest not implemented (openclaw stub)");
}
export function persistSubagentRunsToDisk(..._args: unknown[]): unknown {
  throw new Error("persistSubagentRunsToDisk not implemented (openclaw stub)");
}
export function persistSubagentRunsToDiskOrThrow(..._args: unknown[]): unknown {
  throw new Error("persistSubagentRunsToDiskOrThrow not implemented (openclaw stub)");
}
export function restoreSubagentRunsFromDisk(..._args: unknown[]): unknown {
  throw new Error("restoreSubagentRunsFromDisk not implemented (openclaw stub)");
}
export function getSubagentRunsSnapshotForRead(..._args: unknown[]): unknown {
  throw new Error("getSubagentRunsSnapshotForRead not implemented (openclaw stub)");
}
