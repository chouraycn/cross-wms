/**
 * 移植自 openclaw/src/agents/sessions/tools/grep.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type GrepOperations = unknown;
export type GrepToolOptions = unknown;
export function createGrepToolDefinition(..._args: unknown[]): unknown {
  throw new Error("createGrepToolDefinition not implemented (openclaw stub)");
}
export function createGrepTool(..._args: unknown[]): unknown {
  throw new Error("createGrepTool not implemented (openclaw stub)");
}
