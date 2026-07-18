/**
 * 移植自 openclaw/src/agents/sessions/tools/edit-diff.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type Edit = unknown;
export type EditDiffResult = unknown;
export type EditDiffError = unknown;
export function detectLineEnding(..._args: unknown[]): unknown {
  throw new Error("detectLineEnding not implemented (openclaw stub)");
}
export function normalizeToLF(..._args: unknown[]): unknown {
  throw new Error("normalizeToLF not implemented (openclaw stub)");
}
export function restoreLineEndings(..._args: unknown[]): unknown {
  throw new Error("restoreLineEndings not implemented (openclaw stub)");
}
export function stripBom(..._args: unknown[]): unknown {
  throw new Error("stripBom not implemented (openclaw stub)");
}
export function applyEditsToNormalizedContent(..._args: unknown[]): unknown {
  throw new Error("applyEditsToNormalizedContent not implemented (openclaw stub)");
}
export function generateUnifiedPatch(..._args: unknown[]): unknown {
  throw new Error("generateUnifiedPatch not implemented (openclaw stub)");
}
export function generateDiffString(..._args: unknown[]): unknown {
  throw new Error("generateDiffString not implemented (openclaw stub)");
}
export function computeEditsDiff(..._args: unknown[]): unknown {
  throw new Error("computeEditsDiff not implemented (openclaw stub)");
}
