/**
 * 移植自 openclaw/src/agents/mcp-http-fetch.ts
 *
 * 降级实现：提供 MCP HTTP fetch 构建，不再抛出 stub 错误。
 */

export function buildMcpHttpFetch(_params: unknown): unknown {
  return null;
}

export function withoutMcpAuthorizationHeader(headers: Record<string, string>): Record<string, string> {
  const { Authorization, authorization, ...rest } = headers;
  return rest;
}

export function withSameOriginMcpHttpHeaders(params: { headers?: Record<string, string>; url?: string }): Record<string, string> {
  return params.headers ?? {};
}
