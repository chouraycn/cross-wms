/**
 * Web Search Types — Web 搜索类型定义
 *
 * 定义搜索 Provider、搜索结果、搜索查询、搜索选项等核心类型。
 */

export type SearchProviderId = string;

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  source?: SearchProviderId;
  language?: string;
  publishedAt?: string;
}

export interface SearchQuery {
  query: string;
  maxResults?: number;
  language?: string;
  region?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  safeSearch?: boolean;
}

export interface SearchOptions {
  timeoutMs?: number;
  useCache?: boolean;
  cacheTtlMs?: number;
  signal?: AbortSignal;
  preferredProviders?: SearchProviderId[];
  fallbackEnabled?: boolean;
  maxFallbackRetries?: number;
}

export interface SearchResultList {
  query: string;
  results: SearchResult[];
  count: number;
  provider: SearchProviderId;
  providersUsed?: SearchProviderId[];
  cached?: boolean;
  durationMs?: number;
}

export interface SearchProvider {
  id: SearchProviderId;
  name: string;
  description: string;
  isDomestic: boolean;
  supportsRegions: string[];
  defaultPriority: number;

  search: (
    query: SearchQuery,
    options?: SearchOptions,
  ) => Promise<SearchResultList>;

  isAvailable: () => Promise<boolean> | boolean;
}

export interface SearchProviderConstructorOptions {
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export type SearchProviderFactory = (
  options?: SearchProviderConstructorOptions,
) => SearchProvider;

export interface ProviderRegistryEntry {
  id: SearchProviderId;
  factory: SearchProviderFactory;
  isDomestic: boolean;
  defaultPriority: number;
}

export interface SearchCacheEntry {
  results: SearchResultList;
  timestamp: number;
  ttlMs: number;
}

export interface SearchRuntimeConfig {
  defaultTimeoutMs: number;
  defaultCacheTtlMs: number;
  cacheEnabled: boolean;
  maxCacheSize: number;
  defaultMaxResults: number;
  domesticFirst: boolean;
  fallbackEnabled: boolean;
  maxFallbackRetries: number;
}

export const DEFAULT_SEARCH_CONFIG: SearchRuntimeConfig = {
  defaultTimeoutMs: 15000,
  defaultCacheTtlMs: 5 * 60 * 1000,
  cacheEnabled: true,
  maxCacheSize: 500,
  defaultMaxResults: 10,
  domesticFirst: true,
  fallbackEnabled: true,
  maxFallbackRetries: 3,
};
