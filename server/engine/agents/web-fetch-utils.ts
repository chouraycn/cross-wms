/**
 * 移植自 openclaw/src/agents/tools/web-fetch-utils.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExtractMode = unknown;
export function normalizeWhitespace(..._args: unknown[]): unknown {
  throw new Error("normalizeWhitespace not implemented (openclaw stub)");
}
export function htmlToMarkdown(..._args: unknown[]): unknown {
  throw new Error("htmlToMarkdown not implemented (openclaw stub)");
}
export function markdownToText(..._args: unknown[]): unknown {
  throw new Error("markdownToText not implemented (openclaw stub)");
}
export function truncateText(..._args: unknown[]): unknown {
  throw new Error("truncateText not implemented (openclaw stub)");
}
export function extractBasicHtmlContent(..._args: unknown[]): unknown {
  throw new Error("extractBasicHtmlContent not implemented (openclaw stub)");
}
