/**
 * 移植自 openclaw/src/agents/transcript-policy.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type TranscriptPolicy = unknown;
export function providerRequiresSignedThinking(..._args: unknown[]): unknown {
  throw new Error("providerRequiresSignedThinking not implemented (openclaw stub)");
}
export function shouldAllowProviderOwnedThinkingReplay(..._args: unknown[]): unknown {
  throw new Error("shouldAllowProviderOwnedThinkingReplay not implemented (openclaw stub)");
}
export function resolveTranscriptPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveTranscriptPolicy not implemented (openclaw stub)");
}
