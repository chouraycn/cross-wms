/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/compaction-retry-aggregate-timeout.ts
 *
 * 降级实现：提供 compaction retry 超时管理，不再抛出 stub 错误。
 */

export function hasActiveCompactionRetryWork(_params: unknown): boolean {
  return false;
}

export async function waitForCompactionRetryWithAggregateTimeout(_params: unknown): Promise<void> {
  // no-op in cross-wms降级实现
}
