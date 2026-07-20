/**
 * 移植自 openclaw/src/agents/harness/lifecycle-hook-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function getAgentHarnessHookRunner(..._args: unknown[]): unknown {
  return undefined;
}
export function clearAgentHarnessFinalizeRetryBudget(..._args: unknown[]): unknown {
  return undefined;
}
export function runAgentHarnessLlmInputHook(..._args: unknown[]): unknown {
  return undefined;
}
export function runAgentHarnessLlmOutputHook(..._args: unknown[]): unknown {
  return undefined;
}
export function runAgentHarnessAgentEndHook(..._args: unknown[]): unknown {
  return undefined;
}
export function awaitAgentHarnessAgentEndHook(..._args: unknown[]): unknown {
  return undefined;
}
export function runAgentHarnessBeforeAgentFinalizeHook(..._args: unknown[]): unknown {
  return undefined;
}
