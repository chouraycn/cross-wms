/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/provider-error-patterns.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function matchesProviderContextOverflow(..._args: unknown[]): unknown {
  throw new Error("matchesProviderContextOverflow not implemented (openclaw stub)");
}
export function classifyProviderPluginError(..._args: unknown[]): unknown {
  throw new Error("classifyProviderPluginError not implemented (openclaw stub)");
}
export function classifyProviderSpecificError(..._args: unknown[]): unknown {
  throw new Error("classifyProviderSpecificError not implemented (openclaw stub)");
}
