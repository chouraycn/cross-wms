/**
 * 移植自 openclaw/src/agents/subagent-capabilities.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SubagentSessionRole = unknown;
export type SessionCapabilityStore = unknown;
export function resolveSubagentCapabilityStore(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentCapabilityStore not implemented (openclaw stub)");
}
export function resolveSubagentCapabilities(..._args: unknown[]): unknown {
  throw new Error("resolveSubagentCapabilities not implemented (openclaw stub)");
}
export function isSubagentEnvelopeSession(..._args: unknown[]): unknown {
  throw new Error("isSubagentEnvelopeSession not implemented (openclaw stub)");
}
export function resolveStoredSubagentCapabilities(..._args: unknown[]): unknown {
  throw new Error("resolveStoredSubagentCapabilities not implemented (openclaw stub)");
}
export function resolveStoredSubagentInheritedToolDenylist(..._args: unknown[]): unknown {
  throw new Error("resolveStoredSubagentInheritedToolDenylist not implemented (openclaw stub)");
}
export function resolveStoredSubagentInheritedToolAllowlist(..._args: unknown[]): unknown {
  throw new Error("resolveStoredSubagentInheritedToolAllowlist not implemented (openclaw stub)");
}
