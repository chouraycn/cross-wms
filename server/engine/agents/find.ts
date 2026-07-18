/**
 * 移植自 openclaw/src/agents/sessions/tools/find.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type FindOperations = unknown;
export type FindToolOptions = unknown;
export function createFindToolDefinition(..._args: unknown[]): unknown {
  throw new Error("createFindToolDefinition not implemented (openclaw stub)");
}
export function createFindTool(..._args: unknown[]): unknown {
  throw new Error("createFindTool not implemented (openclaw stub)");
}
