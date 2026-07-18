/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-name-allowlist.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function collectAllowedToolNames(..._args: unknown[]): unknown {
  throw new Error("collectAllowedToolNames not implemented (openclaw stub)");
}
export function collectRegisteredToolNames(..._args: unknown[]): unknown {
  throw new Error("collectRegisteredToolNames not implemented (openclaw stub)");
}
export function collectCoreBuiltinToolNames(..._args: unknown[]): unknown {
  throw new Error("collectCoreBuiltinToolNames not implemented (openclaw stub)");
}
export function toSessionToolAllowlist(..._args: unknown[]): unknown {
  throw new Error("toSessionToolAllowlist not implemented (openclaw stub)");
}
export const AGENT_RESERVED_TOOL_NAMES: unknown = undefined;
