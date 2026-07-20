/**
 * 移植自 openclaw/src/agents/auth-profiles/runtime-snapshots.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function getRuntimeAuthProfileStoreSnapshot(..._args: unknown[]): unknown {
  return undefined;
}
export function hasRuntimeAuthProfileStoreSnapshot(..._args: unknown[]): unknown {
  return false;
}
export function hasAnyRuntimeAuthProfileStoreSource(..._args: unknown[]): unknown {
  return false;
}
export function replaceRuntimeAuthProfileStoreSnapshots(..._args: unknown[]): unknown {
  return undefined;
}
export function clearRuntimeAuthProfileStoreSnapshots(..._args: unknown[]): unknown {
  return undefined;
}
export function setRuntimeAuthProfileStoreSnapshot(..._args: unknown[]): unknown {
  return undefined;
}
