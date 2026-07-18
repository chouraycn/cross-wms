/**
 * 移植自 openclaw/src/agents/models-config.plan.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ResolveImplicitProvidersForModelsJson = unknown;
export async function resolveProvidersForModelsJsonWithDeps(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveProvidersForModelsJsonWithDeps not implemented (openclaw stub)");
}
export async function planOpenClawModelsJsonWithDeps(..._args: unknown[]): Promise<unknown> {
  throw new Error("planOpenClawModelsJsonWithDeps not implemented (openclaw stub)");
}
export async function planOpenClawModelsJson(..._args: unknown[]): Promise<unknown> {
  throw new Error("planOpenClawModelsJson not implemented (openclaw stub)");
}
