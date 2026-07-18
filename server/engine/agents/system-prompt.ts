/**
 * 移植自 openclaw/src/agents/system-prompt.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function buildAgentBootstrapSystemContext(..._args: unknown[]): unknown {
  throw new Error("buildAgentBootstrapSystemContext not implemented (openclaw stub)");
}
export function buildAgentBootstrapSystemPromptSections(..._args: unknown[]): unknown {
  throw new Error("buildAgentBootstrapSystemPromptSections not implemented (openclaw stub)");
}
export function buildModelIdentityPromptLine(..._args: unknown[]): unknown {
  throw new Error("buildModelIdentityPromptLine not implemented (openclaw stub)");
}
export function appendModelIdentitySystemPrompt(..._args: unknown[]): unknown {
  throw new Error("appendModelIdentitySystemPrompt not implemented (openclaw stub)");
}
export function buildAgentSystemPrompt(..._args: unknown[]): unknown {
  throw new Error("buildAgentSystemPrompt not implemented (openclaw stub)");
}
export function buildRuntimeLine(..._args: unknown[]): unknown {
  throw new Error("buildRuntimeLine not implemented (openclaw stub)");
}
