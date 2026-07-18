/**
 * 移植自 openclaw/src/agents/harness/lifecycle-hook-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function getAgentHarnessHookRunner(..._args: unknown[]): unknown {
  throw new Error("getAgentHarnessHookRunner not implemented (openclaw stub)");
}
export function clearAgentHarnessFinalizeRetryBudget(..._args: unknown[]): unknown {
  throw new Error("clearAgentHarnessFinalizeRetryBudget not implemented (openclaw stub)");
}
export function runAgentHarnessLlmInputHook(..._args: unknown[]): unknown {
  throw new Error("runAgentHarnessLlmInputHook not implemented (openclaw stub)");
}
export function runAgentHarnessLlmOutputHook(..._args: unknown[]): unknown {
  throw new Error("runAgentHarnessLlmOutputHook not implemented (openclaw stub)");
}
export function runAgentHarnessAgentEndHook(..._args: unknown[]): unknown {
  throw new Error("runAgentHarnessAgentEndHook not implemented (openclaw stub)");
}
export function awaitAgentHarnessAgentEndHook(..._args: unknown[]): unknown {
  throw new Error("awaitAgentHarnessAgentEndHook not implemented (openclaw stub)");
}
export function runAgentHarnessBeforeAgentFinalizeHook(..._args: unknown[]): unknown {
  throw new Error("runAgentHarnessBeforeAgentFinalizeHook not implemented (openclaw stub)");
}
