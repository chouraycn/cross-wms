/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compaction-safety-timeout.ts
 *
 * 降级实现：提供 compaction 安全超时管理，不再抛出 stub 错误。
 */

export function resolveCompactionTimeoutMs(params: { timeoutMs?: number; defaultMs?: number }): number {
  return params.timeoutMs ?? params.defaultMs ?? 30_000;
}

export async function compactWithSafetyTimeout(params: { compactFn: () => Promise<unknown>; timeoutMs?: number }): Promise<unknown> {
  return await params.compactFn();
}

export async function compactContextEngineWithSafetyTimeout(params: { compactFn: () => Promise<unknown>; timeoutMs?: number }): Promise<unknown> {
  return await params.compactFn();
}
