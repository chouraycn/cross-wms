/**
 * 移植自 openclaw/src/agents/tools/image-tool.helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ImageModelConfig = unknown;
export function hasImageReasoningOnlyResponse(..._args: unknown[]): unknown {
  throw new Error("hasImageReasoningOnlyResponse not implemented (openclaw stub)");
}
export function decodeDataUrl(..._args: unknown[]): unknown {
  throw new Error("decodeDataUrl not implemented (openclaw stub)");
}
export function coerceImageAssistantText(..._args: unknown[]): unknown {
  throw new Error("coerceImageAssistantText not implemented (openclaw stub)");
}
export function coerceImageModelConfig(..._args: unknown[]): unknown {
  throw new Error("coerceImageModelConfig not implemented (openclaw stub)");
}
export function resolveConfiguredImageModelRefs(..._args: unknown[]): unknown {
  throw new Error("resolveConfiguredImageModelRefs not implemented (openclaw stub)");
}
export function resolveProviderVisionModelFromConfig(..._args: unknown[]): unknown {
  throw new Error("resolveProviderVisionModelFromConfig not implemented (openclaw stub)");
}
