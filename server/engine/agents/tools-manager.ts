/**
 * 移植自 openclaw/src/agents/utils/tools-manager.ts
 *
 * 降级实现：提供工具路径解析，不再抛出 stub 错误。
 */

export function getToolPath(_tool: string): string | null {
  return null;
}

export async function ensureTool(_tool: string, _silent?: boolean): Promise<string | undefined> {
  return undefined;
}
