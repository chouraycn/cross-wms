/**
 * 移植自 openclaw/src/agents/sessions/tools/limits.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function normalizePositiveLimit(..._args: unknown[]): unknown {
  throw new Error("normalizePositiveLimit not implemented (openclaw stub)");
}
export function appendBoundedTextTail(..._args: unknown[]): unknown {
  throw new Error("appendBoundedTextTail not implemented (openclaw stub)");
}
export const SESSION_TOOL_STDERR_TAIL_BYTES: unknown = undefined;
