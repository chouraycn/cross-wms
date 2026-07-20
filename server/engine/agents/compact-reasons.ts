/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compact-reasons.ts
 *
 * 降级实现：提供 compaction 原因解析，不再抛出 stub 错误。
 */

export function resolveCompactionFailureReason(_params: unknown): string {
  return "unknown";
}

export function classifyCompactionReason(_params: unknown): string {
  return "unknown";
}

export function formatUnknownCompactionReasonDetail(_params: unknown): string {
  return "";
}

export const DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON = "deferred_context_engine";
