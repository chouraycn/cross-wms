/**
 * 移植自 openclaw/src/agents/harness/registry.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function registerAgentHarness(..._args: unknown[]): unknown {
  throw new Error("registerAgentHarness not implemented (openclaw stub)");
}
export function getRegisteredAgentHarness(..._args: unknown[]): unknown {
  throw new Error("getRegisteredAgentHarness not implemented (openclaw stub)");
}
export function listRegisteredAgentHarnesses(..._args: unknown[]): unknown {
  throw new Error("listRegisteredAgentHarnesses not implemented (openclaw stub)");
}
export function clearAgentHarnesses(..._args: unknown[]): unknown {
  throw new Error("clearAgentHarnesses not implemented (openclaw stub)");
}
export function restoreRegisteredAgentHarnesses(..._args: unknown[]): unknown {
  throw new Error("restoreRegisteredAgentHarnesses not implemented (openclaw stub)");
}
export function resetRegisteredAgentHarnessSessions(..._args: unknown[]): unknown {
  throw new Error("resetRegisteredAgentHarnessSessions not implemented (openclaw stub)");
}
export function disposeRegisteredAgentHarnesses(..._args: unknown[]): unknown {
  throw new Error("disposeRegisteredAgentHarnesses not implemented (openclaw stub)");
}
