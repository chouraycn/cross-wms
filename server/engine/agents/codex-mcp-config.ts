/**
 * 移植自 openclaw/src/agents/codex-mcp-config.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type { CodexBundleMcpThreadConfig, CodexMcpServersConfig, LoadCodexBundleMcpThreadConfigParams } from "./codex-mcp-config.types.js";
export function normalizeCodexMcpServerConfig(..._args: unknown[]): unknown {
  throw new Error("normalizeCodexMcpServerConfig not implemented (openclaw stub)");
}
export function buildCodexMcpServersConfig(..._args: unknown[]): unknown {
  throw new Error("buildCodexMcpServersConfig not implemented (openclaw stub)");
}
export function loadCodexBundleMcpThreadConfig(..._args: unknown[]): unknown {
  throw new Error("loadCodexBundleMcpThreadConfig not implemented (openclaw stub)");
}
