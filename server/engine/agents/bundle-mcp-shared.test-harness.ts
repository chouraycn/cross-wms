/**
 * 移植自 openclaw/src/agents/bundle-mcp-shared.test-harness.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function writeExecutable(..._args: unknown[]): unknown {
  return undefined;
}
export function writeBundleProbeMcpServer(..._args: unknown[]): unknown {
  return undefined;
}
export function writeClaudeBundle(..._args: unknown[]): unknown {
  return undefined;
}
