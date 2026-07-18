/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.context-engine-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AttemptContextEngine = unknown;
export function resolveAttemptBootstrapContext(..._args: unknown[]): unknown {
  throw new Error("resolveAttemptBootstrapContext not implemented (openclaw stub)");
}
export function buildContextEnginePromptCacheInfo(..._args: unknown[]): unknown {
  throw new Error("buildContextEnginePromptCacheInfo not implemented (openclaw stub)");
}
export function findCurrentAttemptAssistantMessage(..._args: unknown[]): unknown {
  throw new Error("findCurrentAttemptAssistantMessage not implemented (openclaw stub)");
}
export function resolvePromptCacheTouchTimestamp(..._args: unknown[]): unknown {
  throw new Error("resolvePromptCacheTouchTimestamp not implemented (openclaw stub)");
}
export function buildLoopPromptCacheInfo(..._args: unknown[]): unknown {
  throw new Error("buildLoopPromptCacheInfo not implemented (openclaw stub)");
}
