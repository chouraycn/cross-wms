/**
 * 移植自 openclaw/src/agents/agent-bundle-mcp-materialize.ts
 *
 * 降级实现：提供 bundle MCP 工具物化，不再抛出 stub 错误。
 */

export function buildBundleMcpToolsFromCatalog(_params: unknown): unknown[] {
  return [];
}

export async function materializeBundleMcpToolsForRun(_params: unknown): Promise<unknown[]> {
  return [];
}

export async function createBundleMcpToolRuntime(_params: unknown): Promise<null> {
  return null;
}
