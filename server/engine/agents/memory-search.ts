/**
 * 移植自 openclaw/src/agents/memory-search.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ResolvedMemorySearchConfig = unknown;
export type ResolvedMemorySearchSyncConfig = unknown;
export function resolveMemorySearchConfig(..._args: unknown[]): unknown {
  throw new Error("resolveMemorySearchConfig not implemented (openclaw stub)");
}
export function resolveMemorySearchSyncConfig(..._args: unknown[]): unknown {
  throw new Error("resolveMemorySearchSyncConfig not implemented (openclaw stub)");
}
