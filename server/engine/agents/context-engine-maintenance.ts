/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/context-engine-maintenance.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function createDeferredTurnMaintenanceAbortSignal(..._args: unknown[]): unknown {
  throw new Error("createDeferredTurnMaintenanceAbortSignal not implemented (openclaw stub)");
}
export function resetDeferredTurnMaintenanceStateForTest(..._args: unknown[]): unknown {
  throw new Error("resetDeferredTurnMaintenanceStateForTest not implemented (openclaw stub)");
}
export function waitForDeferredTurnMaintenanceForSession(..._args: unknown[]): unknown {
  throw new Error("waitForDeferredTurnMaintenanceForSession not implemented (openclaw stub)");
}
export function buildContextEngineMaintenanceRuntimeContext(..._args: unknown[]): unknown {
  throw new Error("buildContextEngineMaintenanceRuntimeContext not implemented (openclaw stub)");
}
export function runContextEngineMaintenance(..._args: unknown[]): unknown {
  throw new Error("runContextEngineMaintenance not implemented (openclaw stub)");
}
