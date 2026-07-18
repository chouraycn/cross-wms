/**
 * 移植自 openclaw/src/agents/agent-bundle-mcp-tools.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { testing, testing as __testing, createSessionMcpRuntime, disposeAllSessionMcpRuntimes, disposeSessionMcpRuntime, getOrCreateSessionMcpRuntime, getSessionMcpRuntimeManager, peekSessionMcpRuntime, resolveSessionMcpConfigSummary, retireSessionMcpRuntime, retireSessionMcpRuntimeForSessionKey } from "./agent-bundle-mcp-runtime.js";
export { buildBundleMcpToolsFromCatalog, createBundleMcpToolRuntime, materializeBundleMcpToolsForRun } from "./agent-bundle-mcp-materialize.js";
export type { BundleMcpToolRuntime, McpCatalogTool, McpServerCatalog, McpToolCatalog, McpToolCatalogDiagnostic, SessionMcpRuntime, SessionMcpRuntimeManager } from "./agent-bundle-mcp-types.js";
