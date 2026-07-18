/**
 * 移植自 openclaw/src/agents/tools/model-config.helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ToolModelConfig = unknown;
export function hasToolModelConfig(..._args: unknown[]): unknown {
  throw new Error("hasToolModelConfig not implemented (openclaw stub)");
}
export function resolveDefaultModelRef(..._args: unknown[]): unknown {
  throw new Error("resolveDefaultModelRef not implemented (openclaw stub)");
}
export function hasAuthForProvider(..._args: unknown[]): unknown {
  throw new Error("hasAuthForProvider not implemented (openclaw stub)");
}
export function hasAuthProfileForProvider(..._args: unknown[]): unknown {
  throw new Error("hasAuthProfileForProvider not implemented (openclaw stub)");
}
export function hasProviderAuthForTool(..._args: unknown[]): unknown {
  throw new Error("hasProviderAuthForTool not implemented (openclaw stub)");
}
export function hasDirectProviderApiKeyAuthForTool(..._args: unknown[]): unknown {
  throw new Error("hasDirectProviderApiKeyAuthForTool not implemented (openclaw stub)");
}
export function resolveOpenAiImageMediaCandidate(..._args: unknown[]): unknown {
  throw new Error("resolveOpenAiImageMediaCandidate not implemented (openclaw stub)");
}
export function coerceToolModelConfig(..._args: unknown[]): unknown {
  throw new Error("coerceToolModelConfig not implemented (openclaw stub)");
}
export function buildToolModelConfigFromCandidates(..._args: unknown[]): unknown {
  throw new Error("buildToolModelConfigFromCandidates not implemented (openclaw stub)");
}
