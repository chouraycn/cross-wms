/**
 * 移植自 openclaw/src/agents/subagent-run-liveness.ts
 *
 * 降级实现：提供子代理运行存活检测，不再抛出 stub 错误。
 */

export const RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS = 60_000;

export function hasSubagentRunEnded(_params: unknown): boolean {
  return false;
}

export function isStaleUnendedSubagentRun(_params: unknown): boolean {
  return false;
}

export function isLiveUnendedSubagentRun(_params: unknown): boolean {
  return false;
}

export function shouldKeepSubagentRunChildLink(_params: unknown): boolean {
  return true;
}
