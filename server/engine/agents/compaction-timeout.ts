/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/compaction-timeout.ts
 *
 * 降级实现：提供 compaction 超时管理，不再抛出 stub 错误。
 */

export function shouldFlagCompactionTimeout(_params: unknown): boolean {
  return false;
}

export function resolveRunTimeoutDuringCompaction(params: { timeoutMs?: number; defaultMs?: number }): number {
  return params.timeoutMs ?? params.defaultMs ?? 60_000;
}

export function selectCompactionTimeoutSnapshot(_params: unknown): null {
  return null;
}
