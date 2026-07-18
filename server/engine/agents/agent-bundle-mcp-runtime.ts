/**
 * 移植自 openclaw/src/agents/agent-bundle-mcp-runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const testing: unknown = undefined;
export function createBundleMcpJsonSchemaValidator(..._args: unknown[]): unknown {
  throw new Error("createBundleMcpJsonSchemaValidator not implemented (openclaw stub)");
}
export function resolveSessionMcpConfigSummary(..._args: unknown[]): unknown {
  throw new Error("resolveSessionMcpConfigSummary not implemented (openclaw stub)");
}
export function createSessionMcpRuntime(..._args: unknown[]): unknown {
  throw new Error("createSessionMcpRuntime not implemented (openclaw stub)");
}
export function getSessionMcpRuntimeManager(..._args: unknown[]): unknown {
  throw new Error("getSessionMcpRuntimeManager not implemented (openclaw stub)");
}
export async function getOrCreateSessionMcpRuntime(..._args: unknown[]): Promise<unknown> {
  throw new Error("getOrCreateSessionMcpRuntime not implemented (openclaw stub)");
}
export function peekSessionMcpRuntime(..._args: unknown[]): unknown {
  throw new Error("peekSessionMcpRuntime not implemented (openclaw stub)");
}
export async function disposeSessionMcpRuntime(..._args: unknown[]): Promise<unknown> {
  throw new Error("disposeSessionMcpRuntime not implemented (openclaw stub)");
}
export async function retireSessionMcpRuntime(..._args: unknown[]): Promise<unknown> {
  throw new Error("retireSessionMcpRuntime not implemented (openclaw stub)");
}
export async function retireSessionMcpRuntimeForSessionKey(..._args: unknown[]): Promise<unknown> {
  throw new Error("retireSessionMcpRuntimeForSessionKey not implemented (openclaw stub)");
}
export async function disposeAllSessionMcpRuntimes(..._args: unknown[]): Promise<unknown> {
  throw new Error("disposeAllSessionMcpRuntimes not implemented (openclaw stub)");
}
