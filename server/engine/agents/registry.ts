/**
 * 移植自 openclaw/src/agents/harness/registry.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function registerAgentHarness(..._args: unknown[]): unknown {
  return undefined;
}
export function getRegisteredAgentHarness(..._args: unknown[]): unknown {
  return undefined;
}
export function listRegisteredAgentHarnesses(..._args: unknown[]): unknown {
  return [];
}
export function clearAgentHarnesses(..._args: unknown[]): unknown {
  return undefined;
}
export function restoreRegisteredAgentHarnesses(..._args: unknown[]): unknown {
  return undefined;
}
export function resetRegisteredAgentHarnessSessions(..._args: unknown[]): unknown {
  return undefined;
}
export function disposeRegisteredAgentHarnesses(..._args: unknown[]): unknown {
  return undefined;
}
