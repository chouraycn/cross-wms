/**
 * 移植自 openclaw/src/agents/simple-completion-runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SimpleCompletionModelOptions = unknown;
export type PreparedSimpleCompletionModel = unknown;
export type AgentSimpleCompletionSelection = unknown;
export type PreparedSimpleCompletionModelForAgent = unknown;
export function resolveSimpleCompletionSelectionForAgent(..._args: unknown[]): unknown {
  return undefined;
}
export async function prepareSimpleCompletionModel(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function prepareSimpleCompletionModelForAgent(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function completeWithPreparedSimpleCompletionModel(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
