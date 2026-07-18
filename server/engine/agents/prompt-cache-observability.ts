/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/prompt-cache-observability.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type PromptCacheChange = unknown;
export type PromptCacheBreak = unknown;
export function collectPromptCacheToolNames(..._args: unknown[]): unknown {
  throw new Error("collectPromptCacheToolNames not implemented (openclaw stub)");
}
export function beginPromptCacheObservation(..._args: unknown[]): unknown {
  throw new Error("beginPromptCacheObservation not implemented (openclaw stub)");
}
export function completePromptCacheObservation(..._args: unknown[]): unknown {
  throw new Error("completePromptCacheObservation not implemented (openclaw stub)");
}
export function resetPromptCacheObservabilityForTest(..._args: unknown[]): unknown {
  throw new Error("resetPromptCacheObservabilityForTest not implemented (openclaw stub)");
}
