/**
 * 移植自 openclaw/src/agents/tools/sessions-send-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AnnounceTarget = unknown;
export function resolveAnnounceTargetFromKey(..._args: unknown[]): unknown {
  throw new Error("resolveAnnounceTargetFromKey not implemented (openclaw stub)");
}
export function buildAgentToAgentMessageContext(..._args: unknown[]): unknown {
  throw new Error("buildAgentToAgentMessageContext not implemented (openclaw stub)");
}
export function buildAgentToAgentReplyContext(..._args: unknown[]): unknown {
  throw new Error("buildAgentToAgentReplyContext not implemented (openclaw stub)");
}
export function buildAgentToAgentAnnounceContext(..._args: unknown[]): unknown {
  throw new Error("buildAgentToAgentAnnounceContext not implemented (openclaw stub)");
}
export function resolvePingPongTurns(..._args: unknown[]): unknown {
  throw new Error("resolvePingPongTurns not implemented (openclaw stub)");
}
