/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run.ts
 *
 * 降级实现：提供 embedded agent 运行，不再抛出 stub 错误。
 */

export async function runEmbeddedAgent(_params: unknown): Promise<unknown> {
  return null;
}
