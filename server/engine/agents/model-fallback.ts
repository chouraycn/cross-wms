/**
 * 移植自 openclaw/src/agents/model-fallback.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ModelFallbackRunOptions = unknown;
export type ModelFallbackResultClassification = unknown;
export const testing: unknown = undefined;
export const probeThrottleInternals: unknown = undefined;
export class FallbackSummaryError {
  constructor(..._args: unknown[]) {
    throw new Error("FallbackSummaryError not implemented (openclaw stub)");
  }
}
export function isFallbackSummaryError(..._args: unknown[]): unknown {
  throw new Error("isFallbackSummaryError not implemented (openclaw stub)");
}
export function resolveImageFallbackCandidates(..._args: unknown[]): unknown {
  throw new Error("resolveImageFallbackCandidates not implemented (openclaw stub)");
}
export function resolveImageFallbackDefaultProvider(..._args: unknown[]): unknown {
  throw new Error("resolveImageFallbackDefaultProvider not implemented (openclaw stub)");
}
export function resolveModelCandidateChain(..._args: unknown[]): unknown {
  throw new Error("resolveModelCandidateChain not implemented (openclaw stub)");
}
export async function runWithModelFallback(..._args: unknown[]): Promise<unknown> {
  throw new Error("runWithModelFallback not implemented (openclaw stub)");
}
export async function runWithImageModelFallback(..._args: unknown[]): Promise<unknown> {
  throw new Error("runWithImageModelFallback not implemented (openclaw stub)");
}
