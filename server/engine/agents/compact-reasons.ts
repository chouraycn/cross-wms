/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compact-reasons.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveCompactionFailureReason(..._args: unknown[]): unknown {
  throw new Error("resolveCompactionFailureReason not implemented (openclaw stub)");
}
export function classifyCompactionReason(..._args: unknown[]): unknown {
  throw new Error("classifyCompactionReason not implemented (openclaw stub)");
}
export function formatUnknownCompactionReasonDetail(..._args: unknown[]): unknown {
  throw new Error("formatUnknownCompactionReasonDetail not implemented (openclaw stub)");
}
export const DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON: unknown = undefined;
