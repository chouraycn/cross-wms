/**
 * 移植自 openclaw/src/agents/provider-auth-aliases.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProviderAuthAliasLookupParams = unknown;
export function resetProviderAuthAliasMapCacheForTest(..._args: unknown[]): unknown {
  throw new Error("resetProviderAuthAliasMapCacheForTest not implemented (openclaw stub)");
}
export function resolveProviderAuthAliasMap(..._args: unknown[]): unknown {
  throw new Error("resolveProviderAuthAliasMap not implemented (openclaw stub)");
}
export function resolveProviderIdForAuth(..._args: unknown[]): unknown {
  throw new Error("resolveProviderIdForAuth not implemented (openclaw stub)");
}
