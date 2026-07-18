/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.llm-boundary.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function normalizeMessagesForLlmBoundary(..._args: unknown[]): unknown {
  throw new Error("normalizeMessagesForLlmBoundary not implemented (openclaw stub)");
}
export function normalizeMessagesForCurrentPromptBoundary(..._args: unknown[]): unknown {
  throw new Error("normalizeMessagesForCurrentPromptBoundary not implemented (openclaw stub)");
}
export function normalizeCurrentPromptTextForLlmBoundary(..._args: unknown[]): unknown {
  throw new Error("normalizeCurrentPromptTextForLlmBoundary not implemented (openclaw stub)");
}
export function installRuntimeContextMessageForPrompt(..._args: unknown[]): unknown {
  throw new Error("installRuntimeContextMessageForPrompt not implemented (openclaw stub)");
}
export function insertRuntimeContextMessageForPrompt(..._args: unknown[]): unknown {
  throw new Error("insertRuntimeContextMessageForPrompt not implemented (openclaw stub)");
}
export function installModelPromptTransform(..._args: unknown[]): unknown {
  throw new Error("installModelPromptTransform not implemented (openclaw stub)");
}
