/**
 * 移植自 openclaw/src/agents/bash-tools.exec-host-node-phases.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function shouldSkipNodeApprovalPrepare(..._args: unknown[]): unknown {
  throw new Error("shouldSkipNodeApprovalPrepare not implemented (openclaw stub)");
}
export function formatNodeRunToolResult(..._args: unknown[]): unknown {
  throw new Error("formatNodeRunToolResult not implemented (openclaw stub)");
}
export async function resolveNodeExecutionTarget(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveNodeExecutionTarget not implemented (openclaw stub)");
}
export function buildNodeSystemRunInvoke(..._args: unknown[]): unknown {
  throw new Error("buildNodeSystemRunInvoke not implemented (openclaw stub)");
}
export async function invokeNodeSystemRunDirect(..._args: unknown[]): Promise<unknown> {
  throw new Error("invokeNodeSystemRunDirect not implemented (openclaw stub)");
}
export async function prepareNodeSystemRun(..._args: unknown[]): Promise<unknown> {
  throw new Error("prepareNodeSystemRun not implemented (openclaw stub)");
}
export async function analyzeNodeApprovalRequirement(..._args: unknown[]): Promise<unknown> {
  throw new Error("analyzeNodeApprovalRequirement not implemented (openclaw stub)");
}
