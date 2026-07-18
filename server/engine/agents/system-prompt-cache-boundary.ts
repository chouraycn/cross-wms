/**
 * 移植自 openclaw/src/agents/system-prompt-cache-boundary.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const SYSTEM_PROMPT_CACHE_BOUNDARY: unknown = undefined;
export function stripSystemPromptCacheBoundary(..._args: unknown[]): unknown {
  throw new Error("stripSystemPromptCacheBoundary not implemented (openclaw stub)");
}
export function ensureSystemPromptCacheBoundary(..._args: unknown[]): unknown {
  throw new Error("ensureSystemPromptCacheBoundary not implemented (openclaw stub)");
}
export function splitSystemPromptCacheBoundary(..._args: unknown[]): unknown {
  throw new Error("splitSystemPromptCacheBoundary not implemented (openclaw stub)");
}
export function prependSystemPromptAdditionAfterCacheBoundary(..._args: unknown[]): unknown {
  throw new Error("prependSystemPromptAdditionAfterCacheBoundary not implemented (openclaw stub)");
}
