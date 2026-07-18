/**
 * 移植自 openclaw/src/agents/utils/syntax-highlight.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type HighlightFormatter = unknown;
export type HighlightTheme = unknown;
export type HighlightOptions = unknown;
export function renderHighlightedHtml(..._args: unknown[]): unknown {
  throw new Error("renderHighlightedHtml not implemented (openclaw stub)");
}
export function highlight(..._args: unknown[]): unknown {
  throw new Error("highlight not implemented (openclaw stub)");
}
export function supportsLanguage(..._args: unknown[]): unknown {
  throw new Error("supportsLanguage not implemented (openclaw stub)");
}
