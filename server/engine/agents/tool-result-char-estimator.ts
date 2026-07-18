/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-result-char-estimator.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type MessageCharEstimateCache = unknown;
export function isToolResultMessage(..._args: unknown[]): unknown {
  throw new Error("isToolResultMessage not implemented (openclaw stub)");
}
export function getToolResultText(..._args: unknown[]): unknown {
  throw new Error("getToolResultText not implemented (openclaw stub)");
}
export function createMessageCharEstimateCache(..._args: unknown[]): unknown {
  throw new Error("createMessageCharEstimateCache not implemented (openclaw stub)");
}
export function estimateMessageCharsCached(..._args: unknown[]): unknown {
  throw new Error("estimateMessageCharsCached not implemented (openclaw stub)");
}
export function estimateContextChars(..._args: unknown[]): unknown {
  throw new Error("estimateContextChars not implemented (openclaw stub)");
}
export function invalidateMessageCharsCacheEntry(..._args: unknown[]): unknown {
  throw new Error("invalidateMessageCharsCacheEntry not implemented (openclaw stub)");
}
export const CHARS_PER_TOKEN_ESTIMATE: unknown = undefined;
export const TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE: unknown = undefined;
