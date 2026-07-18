/**
 * 移植自 openclaw/src/agents/tools/web-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CacheEntry = unknown;
export type ReadResponseTextResult = unknown;
export function resolveTimeoutSeconds(..._args: unknown[]): unknown {
  throw new Error("resolveTimeoutSeconds not implemented (openclaw stub)");
}
export function resolvePositiveTimeoutSeconds(..._args: unknown[]): unknown {
  throw new Error("resolvePositiveTimeoutSeconds not implemented (openclaw stub)");
}
export function resolveCacheTtlMs(..._args: unknown[]): unknown {
  throw new Error("resolveCacheTtlMs not implemented (openclaw stub)");
}
export function normalizeCacheKey(..._args: unknown[]): unknown {
  throw new Error("normalizeCacheKey not implemented (openclaw stub)");
}
export function readCache(..._args: unknown[]): unknown {
  throw new Error("readCache not implemented (openclaw stub)");
}
export function writeCache(..._args: unknown[]): unknown {
  throw new Error("writeCache not implemented (openclaw stub)");
}
export function withTimeout(..._args: unknown[]): unknown {
  throw new Error("withTimeout not implemented (openclaw stub)");
}
export function readResponseText(..._args: unknown[]): unknown {
  throw new Error("readResponseText not implemented (openclaw stub)");
}
export const DEFAULT_TIMEOUT_SECONDS: unknown = undefined;
export const DEFAULT_CACHE_TTL_MINUTES: unknown = undefined;
