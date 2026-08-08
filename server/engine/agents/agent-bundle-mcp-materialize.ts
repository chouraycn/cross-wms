/**
 * 移植自 openclaw/src/agents/agent-bundle-mcp-materialize.ts
 *
 * 降级实现：提供 bundle MCP 工具物化，不再抛出 stub 错误。
 */

export function buildBundleMcpToolsFromCatalog(_params: any): any[] {
  return [];
}

export async function materializeBundleMcpToolsForRun(_params: any): Promise<any[]> {
  return [];
}

export async function createBundleMcpToolRuntime(_params: any): Promise<null> {
  return null;
}
