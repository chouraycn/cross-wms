/**
 * 移植自 openclaw/src/agents/provider-local-service.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProviderLocalServiceLease = unknown;
export function attachModelProviderLocalService(..._args: unknown[]): unknown {
  throw new Error("attachModelProviderLocalService not implemented (openclaw stub)");
}
export function getModelProviderLocalService(..._args: unknown[]): unknown {
  throw new Error("getModelProviderLocalService not implemented (openclaw stub)");
}
export async function ensureModelProviderLocalService(..._args: unknown[]): Promise<unknown> {
  throw new Error("ensureModelProviderLocalService not implemented (openclaw stub)");
}
export function stopManagedProviderLocalServicesForTest(..._args: unknown[]): unknown {
  throw new Error("stopManagedProviderLocalServicesForTest not implemented (openclaw stub)");
}
export function hasLocalServiceProcessExited(..._args: unknown[]): unknown {
  throw new Error("hasLocalServiceProcessExited not implemented (openclaw stub)");
}
