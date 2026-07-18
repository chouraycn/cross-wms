/**
 * 移植自 openclaw/src/agents/run-session-target.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AgentRunSessionTarget = unknown;
export type ResolvedAgentRunSessionTarget = unknown;
export async function resolveAgentRunSessionTarget(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveAgentRunSessionTarget not implemented (openclaw stub)");
}
export function applyAgentRunSessionTargetIdentity(..._args: unknown[]): unknown {
  throw new Error("applyAgentRunSessionTargetIdentity not implemented (openclaw stub)");
}
