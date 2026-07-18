/**
 * 移植自 openclaw/src/agents/bootstrap-files.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type BootstrapContextMode = unknown;
export const FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE: unknown = undefined;
export function resetBootstrapWarningCacheForTest(..._args: unknown[]): unknown {
  throw new Error("resetBootstrapWarningCacheForTest not implemented (openclaw stub)");
}
export function resolveContextInjectionMode(..._args: unknown[]): unknown {
  throw new Error("resolveContextInjectionMode not implemented (openclaw stub)");
}
export async function hasCompletedBootstrapTurn(..._args: unknown[]): Promise<unknown> {
  throw new Error("hasCompletedBootstrapTurn not implemented (openclaw stub)");
}
export function makeBootstrapWarn(..._args: unknown[]): unknown {
  throw new Error("makeBootstrapWarn not implemented (openclaw stub)");
}
export async function resolveBootstrapFilesForRun(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveBootstrapFilesForRun not implemented (openclaw stub)");
}
export async function resolveBootstrapContextForRun(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveBootstrapContextForRun not implemented (openclaw stub)");
}
export function buildBootstrapContextForFiles(..._args: unknown[]): unknown {
  throw new Error("buildBootstrapContextForFiles not implemented (openclaw stub)");
}
