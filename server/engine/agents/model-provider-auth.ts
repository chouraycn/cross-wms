/**
 * 移植自 openclaw/src/agents/model-provider-auth.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export async function hasAuthForModelProvider(..._args: unknown[]): Promise<unknown> {
  throw new Error("hasAuthForModelProvider not implemented (openclaw stub)");
}
export function createProviderAuthChecker(..._args: unknown[]): unknown {
  throw new Error("createProviderAuthChecker not implemented (openclaw stub)");
}
export async function buildCurrentProviderAuthStateSnapshot(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildCurrentProviderAuthStateSnapshot not implemented (openclaw stub)");
}
export async function warmCurrentProviderAuthStateOffMainThread(..._args: unknown[]): Promise<unknown> {
  throw new Error("warmCurrentProviderAuthStateOffMainThread not implemented (openclaw stub)");
}
