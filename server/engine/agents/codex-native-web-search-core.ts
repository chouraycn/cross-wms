/**
 * 移植自 openclaw/src/agents/codex-native-web-search-core.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type NativeWebSearchToolPolicyParams = unknown;
export function isCodexNativeSearchEligibleModel(..._args: unknown[]): unknown {
  throw new Error("isCodexNativeSearchEligibleModel not implemented (openclaw stub)");
}
export function hasAvailableCodexAuth(..._args: unknown[]): unknown {
  throw new Error("hasAvailableCodexAuth not implemented (openclaw stub)");
}
export function resolveCodexNativeSearchActivation(..._args: unknown[]): unknown {
  throw new Error("resolveCodexNativeSearchActivation not implemented (openclaw stub)");
}
export function isNativeWebSearchAllowedByToolPolicy(..._args: unknown[]): unknown {
  throw new Error("isNativeWebSearchAllowedByToolPolicy not implemented (openclaw stub)");
}
export function buildCodexNativeWebSearchTool(..._args: unknown[]): unknown {
  throw new Error("buildCodexNativeWebSearchTool not implemented (openclaw stub)");
}
export function patchCodexNativeWebSearchPayload(..._args: unknown[]): unknown {
  throw new Error("patchCodexNativeWebSearchPayload not implemented (openclaw stub)");
}
export function shouldSuppressManagedWebSearchTool(..._args: unknown[]): unknown {
  throw new Error("shouldSuppressManagedWebSearchTool not implemented (openclaw stub)");
}
