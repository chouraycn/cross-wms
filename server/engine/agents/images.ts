/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/images.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function mergePromptAttachmentImages(..._args: unknown[]): unknown {
  throw new Error("mergePromptAttachmentImages not implemented (openclaw stub)");
}
export function splitPromptAndAttachmentRefs(..._args: unknown[]): unknown {
  throw new Error("splitPromptAndAttachmentRefs not implemented (openclaw stub)");
}
export function detectImageReferences(..._args: unknown[]): unknown {
  throw new Error("detectImageReferences not implemented (openclaw stub)");
}
export function loadImageFromRef(..._args: unknown[]): unknown {
  throw new Error("loadImageFromRef not implemented (openclaw stub)");
}
export function modelSupportsImages(..._args: unknown[]): unknown {
  throw new Error("modelSupportsImages not implemented (openclaw stub)");
}
export function detectAndLoadPromptImages(..._args: unknown[]): unknown {
  throw new Error("detectAndLoadPromptImages not implemented (openclaw stub)");
}
