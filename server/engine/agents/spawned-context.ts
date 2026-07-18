/**
 * 移植自 openclaw/src/agents/spawned-context.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SpawnedRunMetadata = unknown;
export type SpawnedToolContext = unknown;
export function normalizeSpawnedRunMetadata(..._args: unknown[]): unknown {
  throw new Error("normalizeSpawnedRunMetadata not implemented (openclaw stub)");
}
export function mapToolContextToSpawnedRunMetadata(..._args: unknown[]): unknown {
  throw new Error("mapToolContextToSpawnedRunMetadata not implemented (openclaw stub)");
}
export function resolveSpawnedWorkspaceInheritance(..._args: unknown[]): unknown {
  throw new Error("resolveSpawnedWorkspaceInheritance not implemented (openclaw stub)");
}
export function resolveIngressWorkspaceOverrideForSpawnedRun(..._args: unknown[]): unknown {
  throw new Error("resolveIngressWorkspaceOverrideForSpawnedRun not implemented (openclaw stub)");
}
