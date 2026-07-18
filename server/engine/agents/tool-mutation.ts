/**
 * 移植自 openclaw/src/agents/tool-mutation.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type FileTarget = unknown;
export function isLikelyMutatingToolName(..._args: unknown[]): unknown {
  throw new Error("isLikelyMutatingToolName not implemented (openclaw stub)");
}
export function isMutatingToolCall(..._args: unknown[]): unknown {
  throw new Error("isMutatingToolCall not implemented (openclaw stub)");
}
export function isReplaySafeToolCall(..._args: unknown[]): unknown {
  throw new Error("isReplaySafeToolCall not implemented (openclaw stub)");
}
export function buildToolMutationState(..._args: unknown[]): unknown {
  throw new Error("buildToolMutationState not implemented (openclaw stub)");
}
export function isSameToolMutationAction(..._args: unknown[]): unknown {
  throw new Error("isSameToolMutationAction not implemented (openclaw stub)");
}
