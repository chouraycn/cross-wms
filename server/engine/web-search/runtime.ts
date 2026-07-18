/**
 * Web Search Runtime — 搜索运行时
 *
 * 负责 Provider 选择、结果合并、缓存管理、回退策略等核心运行时功能。
 */

import type {
  SearchQuery,
  SearchOptions,
  SearchResultList,
  SearchResult,
  SearchRuntimeConfig,
  SearchCacheEntry,
  SearchProviderId,
  SearchProvider,
} from './types.js';
import { DEFAULT_SEARCH_CONFIG } from './types.js';
import {
  getProviderInstance,
  getProvidersSortedByPriority,
  hasProvider,
} from './provider-registry.js';
import { logger } from '../../logger.js';

class SearchCache {
  private cache = new Map<string, SearchCacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  private getCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      q: query.query.toLowerCase(),
      max: query.maxResults,
      lang: query.language,
      region: query.region,
      time: query.timeRange,
      safe: query.safeSearch,
    });
  }

  get(query: SearchQuery): SearchResultList | null {
    const key = this.getCacheKey(query);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return { ...entry.results, cached: true };
  }

  set(query: SearchQuery, results: SearchResultList, ttlMs: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const key = this.getCacheKey(query);
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  delete(query: SearchQuery): boolean {
    const key = this.getCacheKey(query);
    return this.cache.delete(key);
  }
}

export class SearchRuntime {
  private config: SearchRuntimeConfig;
  private cache: SearchCache;

  constructor(config?: Partial<SearchRuntimeConfig>) {
    this.config = { ...DEFAULT_SEARCH_CONFIG, ...config };
    this.cache = new SearchCache(this.config.maxCacheSize);
  }

  getConfig(): SearchRuntimeConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<SearchRuntimeConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxCacheSize !== undefined) {
      this.cache = new SearchCache(config.maxCacheSize);
    }
  }

  getCache(): SearchCache {
    return this.cache;
  }

  async search(
    query: SearchQuery,
    options?: SearchOptions,
  ): Promise<SearchResultList> {
    const startTime = Date.now();

    this.validateQuery(query);

    const normalizedQuery = this.normalizeQuery(query);
    const normalizedOptions = this.normalizeOptions(options);

    if (normalizedOptions.useCache && this.config.cacheEnabled) {
      const cached = this.cache.get(normalizedQuery);
      if (cached) {
        logger.debug(`Search cache hit for query: ${normalizedQuery.query}`);
        return {
          ...cached,
          durationMs: Date.now() - startTime,
        };
      }
    }

    const providers = this.selectProviders(normalizedOptions);
    logger.debug(`Selected ${providers.length} providers for search: ${providers.join(', ')}`);

    let lastError: Error | null = null;
    const providersUsed: SearchProviderId[] = [];
    let result: SearchResultList | null = null;

    const maxRetries = normalizedOptions.fallbackEnabled
      ? Math.min(normalizedOptions.maxFallbackRetries || this.config.maxFallbackRetries, providers.length)
      : 1;

    for (let i = 0; i < maxRetries; i++) {
      const providerId = providers[i];
      if (!providerId) break;

      const provider = getProviderInstance(providerId);
      if (!provider) {
        logger.warn(`Provider '${providerId}' not available, skipping`);
        continue;
      }

      try {
        logger.debug(`Trying search with provider: ${providerId}`);
        result = await this.executeSearch(provider, normalizedQuery, normalizedOptions);
        providersUsed.push(providerId);

        if (result.results.length > 0) {
          break;
        }
        logger.debug(`Provider '${providerId}' returned no results, trying next`);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        logger.warn(`Search with provider '${providerId}' failed: ${lastError.message}`);
        providersUsed.push(providerId);
      }
    }

    if (!result) {
      const errorMessage = lastError
        ? `All providers failed. Last error: ${lastError.message}`
        : 'No search providers available';
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    const finalResult: SearchResultList = {
      ...result,
      providersUsed,
      durationMs: Date.now() - startTime,
    };

    if (normalizedOptions.useCache && this.config.cacheEnabled) {
      this.cache.set(normalizedQuery, finalResult, normalizedOptions.cacheTtlMs || this.config.defaultCacheTtlMs);
    }

    logger.debug(`Search completed in ${finalResult.durationMs}ms with ${finalResult.count} results`);
    return finalResult;
  }

  private async executeSearch(
    provider: SearchProvider,
    query: SearchQuery,
    options: SearchOptions,
  ): Promise<SearchResultList> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.config.defaultTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const abortHandler = () => controller.abort();
    options.signal?.addEventListener('abort', abortHandler);

    try {
      const result = await provider.search(query, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortHandler);

      return this.normalizeResults(result, provider.id);
    } catch (e) {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortHandler);

      if (e instanceof DOMException && e.name === 'AbortError') {
        if (options.signal?.aborted) {
          throw e;
        }
        throw new Error(`Search timed out after ${timeoutMs}ms`);
      }
      throw e;
    }
  }

  private validateQuery(query: SearchQuery): void {
    if (!query.query || typeof query.query !== 'string') {
      throw new Error('Search query must be a non-empty string');
    }

    const trimmed = query.query.trim();
    if (trimmed.length === 0) {
      throw new Error('Search query cannot be empty');
    }

    if (trimmed.length > 1000) {
      throw new Error('Search query is too long (max 1000 characters)');
    }

    if (query.maxResults !== undefined) {
      if (query.maxResults < 1 || query.maxResults > 50) {
        throw new Error('maxResults must be between 1 and 50');
      }
    }
  }

  private normalizeQuery(query: SearchQuery): SearchQuery {
    return {
      ...query,
      query: query.query.trim(),
      maxResults: query.maxResults || this.config.defaultMaxResults,
    };
  }

  private normalizeOptions(options?: SearchOptions): SearchOptions {
    return {
      useCache: options?.useCache ?? true,
      cacheTtlMs: options?.cacheTtlMs || this.config.defaultCacheTtlMs,
      timeoutMs: options?.timeoutMs || this.config.defaultTimeoutMs,
      fallbackEnabled: options?.fallbackEnabled ?? this.config.fallbackEnabled,
      maxFallbackRetries: options?.maxFallbackRetries || this.config.maxFallbackRetries,
      preferredProviders: options?.preferredProviders,
      signal: options?.signal,
    };
  }

  private selectProviders(options: SearchOptions): SearchProviderId[] {
    if (options.preferredProviders && options.preferredProviders.length > 0) {
      const validProviders = options.preferredProviders.filter((id) => hasProvider(id));
      if (validProviders.length > 0) {
        return validProviders;
      }
    }

    const sorted = getProvidersSortedByPriority(this.config.domesticFirst);
    return sorted.map((p) => p.id);
  }

  private normalizeResults(
    result: SearchResultList,
    providerId: SearchProviderId,
  ): SearchResultList {
    const normalizedResults: SearchResult[] = result.results
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: String(r.title).trim(),
        url: String(r.url).trim(),
        snippet: r.snippet ? String(r.snippet).trim() : undefined,
        source: r.source || providerId,
        language: r.language,
        publishedAt: r.publishedAt,
      }));

    return {
      ...result,
      results: normalizedResults,
      count: normalizedResults.length,
      provider: result.provider || providerId,
    };
  }

  mergeResults(results: SearchResultList[]): SearchResult[] {
    const seenUrls = new Set<string>();
    const merged: SearchResult[] = [];

    for (const resultList of results) {
      for (const result of resultList.results) {
        const normalizedUrl = result.url.toLowerCase().replace(/\/$/, '');
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          merged.push(result);
        }
      }
    }

    return merged;
  }

  clearCache(): void {
    this.cache.clear();
    logger.debug('Search cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size();
  }
}

export const searchRuntime = new SearchRuntime();
