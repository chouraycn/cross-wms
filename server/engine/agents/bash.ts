/**
 * 移植自 openclaw/src/agents/sessions/tools/bash.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type BashSpawnHook = unknown;
export type BashSpawnContext = unknown;
export type BashToolOptions = unknown;
export function resolveBashTimeoutMs(..._args: unknown[]): unknown {
  throw new Error("resolveBashTimeoutMs not implemented (openclaw stub)");
}
export function createLocalBashOperations(..._args: unknown[]): unknown {
  throw new Error("createLocalBashOperations not implemented (openclaw stub)");
}
export function createBashToolDefinition(..._args: unknown[]): unknown {
  throw new Error("createBashToolDefinition not implemented (openclaw stub)");
}
export function createBashTool(..._args: unknown[]): unknown {
  throw new Error("createBashTool not implemented (openclaw stub)");
}
