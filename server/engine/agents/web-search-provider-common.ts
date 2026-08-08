/**
 * 移植自 openclaw/src/agents/tools/web-search-provider-common.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SearchConfigRecord = unknown;
export function resolveSearchTimeoutSeconds(..._args: any[]): any {
  return undefined;
}
export function resolveSearchCacheTtlMs(..._args: any[]): any {
  return undefined;
}
export function resolveSearchCount(..._args: any[]): any {
  return undefined;
}
export function readConfiguredSecretString(..._args: any[]): any {
  return undefined;
}
export function readProviderEnvValue(..._args: any[]): any {
  return undefined;
}
export function withTrustedWebSearchEndpoint(..._args: any[]): any {
  return undefined;
}
export function withSelfHostedWebSearchEndpoint(..._args: any[]): any {
  return undefined;
}
export function postTrustedWebToolsJson(..._args: any[]): any {
  return undefined;
}
export function throwWebSearchApiError(..._args: any[]): any {
  return undefined;
}
export function resolveSiteName(..._args: any[]): any {
  return undefined;
}
export function isoToPerplexityDate(..._args: any[]): any {
  return false;
}
export function normalizeToIsoDate(..._args: any[]): any {
  return undefined;
}
export function parseIsoDateRange(..._args: any[]): any {
  return undefined;
}
export function normalizeFreshness(..._args: any[]): any {
  return undefined;
}
export function parseWebSearchTimeFilters(..._args: any[]): any {
  return undefined;
}
export function readCachedSearchPayload(..._args: any[]): any {
  return undefined;
}
export function buildSearchCacheKey(..._args: any[]): any {
  return undefined;
}
export function writeCachedSearchPayload(..._args: any[]): any {
  return undefined;
}
export function buildUnsupportedSearchFilterResponse(..._args: any[]): any {
  return undefined;
}
export const DEFAULT_SEARCH_COUNT: any = undefined;
export const MAX_SEARCH_COUNT: any = undefined;
export const SEARCH_CACHE: any = undefined;
export const FRESHNESS_TO_RECENCY: any = undefined;
