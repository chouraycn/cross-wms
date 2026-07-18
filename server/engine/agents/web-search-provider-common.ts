/**
 * 移植自 openclaw/src/agents/tools/web-search-provider-common.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SearchConfigRecord = unknown;
export function resolveSearchTimeoutSeconds(..._args: unknown[]): unknown {
  throw new Error("resolveSearchTimeoutSeconds not implemented (openclaw stub)");
}
export function resolveSearchCacheTtlMs(..._args: unknown[]): unknown {
  throw new Error("resolveSearchCacheTtlMs not implemented (openclaw stub)");
}
export function resolveSearchCount(..._args: unknown[]): unknown {
  throw new Error("resolveSearchCount not implemented (openclaw stub)");
}
export function readConfiguredSecretString(..._args: unknown[]): unknown {
  throw new Error("readConfiguredSecretString not implemented (openclaw stub)");
}
export function readProviderEnvValue(..._args: unknown[]): unknown {
  throw new Error("readProviderEnvValue not implemented (openclaw stub)");
}
export function withTrustedWebSearchEndpoint(..._args: unknown[]): unknown {
  throw new Error("withTrustedWebSearchEndpoint not implemented (openclaw stub)");
}
export function withSelfHostedWebSearchEndpoint(..._args: unknown[]): unknown {
  throw new Error("withSelfHostedWebSearchEndpoint not implemented (openclaw stub)");
}
export function postTrustedWebToolsJson(..._args: unknown[]): unknown {
  throw new Error("postTrustedWebToolsJson not implemented (openclaw stub)");
}
export function throwWebSearchApiError(..._args: unknown[]): unknown {
  throw new Error("throwWebSearchApiError not implemented (openclaw stub)");
}
export function resolveSiteName(..._args: unknown[]): unknown {
  throw new Error("resolveSiteName not implemented (openclaw stub)");
}
export function isoToPerplexityDate(..._args: unknown[]): unknown {
  throw new Error("isoToPerplexityDate not implemented (openclaw stub)");
}
export function normalizeToIsoDate(..._args: unknown[]): unknown {
  throw new Error("normalizeToIsoDate not implemented (openclaw stub)");
}
export function parseIsoDateRange(..._args: unknown[]): unknown {
  throw new Error("parseIsoDateRange not implemented (openclaw stub)");
}
export function normalizeFreshness(..._args: unknown[]): unknown {
  throw new Error("normalizeFreshness not implemented (openclaw stub)");
}
export function parseWebSearchTimeFilters(..._args: unknown[]): unknown {
  throw new Error("parseWebSearchTimeFilters not implemented (openclaw stub)");
}
export function readCachedSearchPayload(..._args: unknown[]): unknown {
  throw new Error("readCachedSearchPayload not implemented (openclaw stub)");
}
export function buildSearchCacheKey(..._args: unknown[]): unknown {
  throw new Error("buildSearchCacheKey not implemented (openclaw stub)");
}
export function writeCachedSearchPayload(..._args: unknown[]): unknown {
  throw new Error("writeCachedSearchPayload not implemented (openclaw stub)");
}
export function buildUnsupportedSearchFilterResponse(..._args: unknown[]): unknown {
  throw new Error("buildUnsupportedSearchFilterResponse not implemented (openclaw stub)");
}
export const DEFAULT_SEARCH_COUNT: unknown = undefined;
export const MAX_SEARCH_COUNT: unknown = undefined;
export const SEARCH_CACHE: unknown = undefined;
export const FRESHNESS_TO_RECENCY: unknown = undefined;
