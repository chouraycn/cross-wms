/**
 * 移植自 openclaw/src/agents/agent-settings.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const DEFAULT_AGENT_COMPACTION_RESERVE_TOKENS_FLOOR: unknown = undefined;
export function applyAgentCompactionSettingsFromConfig(..._args: unknown[]): unknown {
  throw new Error("applyAgentCompactionSettingsFromConfig not implemented (openclaw stub)");
}
export function resolveEffectiveCompactionMode(..._args: unknown[]): unknown {
  throw new Error("resolveEffectiveCompactionMode not implemented (openclaw stub)");
}
export function isSilentOverflowProneModel(..._args: unknown[]): unknown {
  throw new Error("isSilentOverflowProneModel not implemented (openclaw stub)");
}
export function applyAgentAutoCompactionGuard(..._args: unknown[]): unknown {
  throw new Error("applyAgentAutoCompactionGuard not implemented (openclaw stub)");
}
