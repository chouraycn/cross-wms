/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/context-truncation-notice.ts
 *
 * 降级实现：提供上下文截断通知，不再抛出 stub 错误。
 */

export function formatContextLimitTruncationNotice(_params?: unknown): string {
  return "";
}

export const CONTEXT_LIMIT_TRUNCATION_NOTICE = "";
