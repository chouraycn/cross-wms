/**
 * 移植自 openclaw/src/agents/cli-runner/bundle-mcp-codex.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function injectCodexMcpConfigArgs(..._args: unknown[]): unknown {
  throw new Error("injectCodexMcpConfigArgs not implemented (openclaw stub)");
}
export function buildCodexUserMcpServersThreadConfigPatch(..._args: unknown[]): unknown {
  throw new Error("buildCodexUserMcpServersThreadConfigPatch not implemented (openclaw stub)");
}
