/**
 * 移植自 openclaw/src/agents/sessions/tools/edit.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type EditOperations = unknown;
export type EditToolOptions = unknown;
export function createEditToolDefinition(..._args: unknown[]): unknown {
  throw new Error("createEditToolDefinition not implemented (openclaw stub)");
}
export function createEditTool(..._args: unknown[]): unknown {
  throw new Error("createEditTool not implemented (openclaw stub)");
}
