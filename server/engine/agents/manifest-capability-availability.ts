/**
 * 移植自 openclaw/src/agents/tools/manifest-capability-availability.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function getCurrentCapabilityMetadataSnapshot(..._args: unknown[]): unknown {
  throw new Error("getCurrentCapabilityMetadataSnapshot not implemented (openclaw stub)");
}
export function loadCapabilityMetadataSnapshot(..._args: unknown[]): unknown {
  throw new Error("loadCapabilityMetadataSnapshot not implemented (openclaw stub)");
}
export function hasSnapshotCapabilityAvailability(..._args: unknown[]): unknown {
  throw new Error("hasSnapshotCapabilityAvailability not implemented (openclaw stub)");
}
export function hasSnapshotProviderEnvAvailability(..._args: unknown[]): unknown {
  throw new Error("hasSnapshotProviderEnvAvailability not implemented (openclaw stub)");
}
export function hasSnapshotCapabilityProviderAvailability(..._args: unknown[]): unknown {
  throw new Error("hasSnapshotCapabilityProviderAvailability not implemented (openclaw stub)");
}
