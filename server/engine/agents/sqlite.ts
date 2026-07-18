/**
 * 移植自 openclaw/src/agents/auth-profiles/sqlite.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveAuthProfileDatabasePath(..._args: unknown[]): unknown {
  throw new Error("resolveAuthProfileDatabasePath not implemented (openclaw stub)");
}
export function resolveAuthProfileDatabaseFilePaths(..._args: unknown[]): unknown {
  throw new Error("resolveAuthProfileDatabaseFilePaths not implemented (openclaw stub)");
}
export function readPersistedAuthProfileStoreRaw(..._args: unknown[]): unknown {
  throw new Error("readPersistedAuthProfileStoreRaw not implemented (openclaw stub)");
}
export function readPersistedAuthProfileStateRaw(..._args: unknown[]): unknown {
  throw new Error("readPersistedAuthProfileStateRaw not implemented (openclaw stub)");
}
export function writePersistedAuthProfileStoreRaw(..._args: unknown[]): unknown {
  throw new Error("writePersistedAuthProfileStoreRaw not implemented (openclaw stub)");
}
export function deletePersistedAuthProfileStoreRaw(..._args: unknown[]): unknown {
  throw new Error("deletePersistedAuthProfileStoreRaw not implemented (openclaw stub)");
}
export function writePersistedAuthProfileStateRaw(..._args: unknown[]): unknown {
  throw new Error("writePersistedAuthProfileStateRaw not implemented (openclaw stub)");
}
export function runAuthProfileWriteTransaction(..._args: unknown[]): unknown {
  throw new Error("runAuthProfileWriteTransaction not implemented (openclaw stub)");
}
