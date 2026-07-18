/**
 * 移植自 openclaw/src/agents/harness/context-engine-lifecycle.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type HarnessContextEngine = unknown;
export function bootstrapHarnessContextEngine(..._args: unknown[]): unknown {
  throw new Error("bootstrapHarnessContextEngine not implemented (openclaw stub)");
}
export function assembleHarnessContextEngine(..._args: unknown[]): unknown {
  throw new Error("assembleHarnessContextEngine not implemented (openclaw stub)");
}
export function finalizeHarnessContextEngineTurn(..._args: unknown[]): unknown {
  throw new Error("finalizeHarnessContextEngineTurn not implemented (openclaw stub)");
}
export function buildHarnessContextEngineRuntimeContext(..._args: unknown[]): unknown {
  throw new Error("buildHarnessContextEngineRuntimeContext not implemented (openclaw stub)");
}
export function buildHarnessContextEngineRuntimeContextFromUsage(..._args: unknown[]): unknown {
  throw new Error("buildHarnessContextEngineRuntimeContextFromUsage not implemented (openclaw stub)");
}
export function runHarnessContextEngineMaintenance(..._args: unknown[]): unknown {
  throw new Error("runHarnessContextEngineMaintenance not implemented (openclaw stub)");
}
export function isActiveHarnessContextEngine(..._args: unknown[]): unknown {
  throw new Error("isActiveHarnessContextEngine not implemented (openclaw stub)");
}
