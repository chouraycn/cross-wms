/**
 * 移植自 openclaw/src/agents/subagent-spawn-plan.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function splitModelRef(..._args: unknown[]): unknown {
  throw new Error("splitModelRef not implemented (openclaw stub)");
}
export function resolveConfiguredSubagentRunTimeoutSeconds(..._args: unknown[]): unknown {
  throw new Error("resolveConfiguredSubagentRunTimeoutSeconds not implemented (openclaw stub)");
}
export function resolveSubagentModelAndThinkingPlan(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentModelAndThinkingPlan not implemented (openclaw stub)");
}
