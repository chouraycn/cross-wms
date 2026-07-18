/**
 * 移植自 openclaw/src/agents/mcp-oauth.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type McpOAuthCredentialsStatus = unknown;
export function createMcpOAuthClientProvider(..._args: unknown[]): unknown {
  throw new Error("createMcpOAuthClientProvider not implemented (openclaw stub)");
}
export async function clearMcpOAuthCredentials(..._args: unknown[]): Promise<unknown> {
  throw new Error("clearMcpOAuthCredentials not implemented (openclaw stub)");
}
export async function readMcpOAuthCredentialsStatus(..._args: unknown[]): Promise<unknown> {
  throw new Error("readMcpOAuthCredentialsStatus not implemented (openclaw stub)");
}
export async function runMcpOAuthLogin(..._args: unknown[]): Promise<unknown> {
  throw new Error("runMcpOAuthLogin not implemented (openclaw stub)");
}
