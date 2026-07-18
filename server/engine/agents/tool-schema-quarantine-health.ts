/**
 * 移植自 openclaw/src/agents/tool-schema-quarantine-health.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type RuntimeToolSchemaQuarantineIdentity = unknown;
export function recordPersistedRuntimeToolSchemaQuarantine(..._args: unknown[]): unknown {
  throw new Error("recordPersistedRuntimeToolSchemaQuarantine not implemented (openclaw stub)");
}
export function clearRecoveredPersistedRuntimeToolSchemaQuarantines(..._args: unknown[]): unknown {
  throw new Error("clearRecoveredPersistedRuntimeToolSchemaQuarantines not implemented (openclaw stub)");
}
export function listPersistedRuntimeToolSchemaQuarantines(..._args: unknown[]): unknown {
  throw new Error("listPersistedRuntimeToolSchemaQuarantines not implemented (openclaw stub)");
}
