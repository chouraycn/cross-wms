/**
 * 移植自 openclaw/src/agents/embedded-agent-utils.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { stripModelSpecialTokens } from "../shared/text/model-special-tokens.js";
export const THINKING_TAG_SCAN_RE: unknown = undefined;
export function isAssistantMessage(..._args: unknown[]): unknown {
  throw new Error("isAssistantMessage not implemented (openclaw stub)");
}
export function stripThinkingTagsFromText(..._args: unknown[]): unknown {
  throw new Error("stripThinkingTagsFromText not implemented (openclaw stub)");
}
export function sanitizeAssistantVisibleStreamText(..._args: unknown[]): unknown {
  throw new Error("sanitizeAssistantVisibleStreamText not implemented (openclaw stub)");
}
export function extractAssistantVisibleText(..._args: unknown[]): unknown {
  throw new Error("extractAssistantVisibleText not implemented (openclaw stub)");
}
export function extractAssistantText(..._args: unknown[]): unknown {
  throw new Error("extractAssistantText not implemented (openclaw stub)");
}
export function extractAssistantThinking(..._args: unknown[]): unknown {
  throw new Error("extractAssistantThinking not implemented (openclaw stub)");
}
export function formatReasoningMessage(..._args: unknown[]): unknown {
  throw new Error("formatReasoningMessage not implemented (openclaw stub)");
}
export function splitThinkingTaggedText(..._args: unknown[]): unknown {
  throw new Error("splitThinkingTaggedText not implemented (openclaw stub)");
}
export function promoteThinkingTagsToBlocks(..._args: unknown[]): unknown {
  throw new Error("promoteThinkingTagsToBlocks not implemented (openclaw stub)");
}
export function extractThinkingFromTaggedText(..._args: unknown[]): unknown {
  throw new Error("extractThinkingFromTaggedText not implemented (openclaw stub)");
}
export function extractThinkingFromTaggedStream(..._args: unknown[]): unknown {
  throw new Error("extractThinkingFromTaggedStream not implemented (openclaw stub)");
}
export function inferToolMetaFromArgs(..._args: unknown[]): unknown {
  throw new Error("inferToolMetaFromArgs not implemented (openclaw stub)");
}
