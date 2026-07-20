/**
 * 移植自 openclaw/src/agents/bash-tools.exec-host-node.ts
 *
 * 降级实现：提供 Node host command 执行，不再抛出 stub 错误。
 */

export async function executeNodeHostCommand(_params: unknown): Promise<never> {
  throw new Error("Node host command execution is not available in cross-wms mode.");
}
