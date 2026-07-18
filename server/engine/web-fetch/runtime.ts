/**
 * Web Fetch Runtime — Web 获取运行时
 *
 * 负责网页获取、重试、超时、缓存、代理等核心运行时功能。
 */

import type {
  FetchOptions,
  FetchResult,
  FetchRuntimeConfig,
  FetchCacheEntry,
} from './types.js';
import { DEFAULT_FETCH_CONFIG } from './types.js';
import { extractContent } from './content-extractors.js';
import { proxyManager } from './proxy-manager.js';
import { logger } from '../../logger.js';

class FetchCache {
  private cache = new Map<string, FetchCacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  private getCacheKey(url: string, options?: FetchOptions): string {
    return JSON.stringify({
      url,
      renderJs: options?.renderJavaScript,
      extract: options?.extractContent,
      mode: options?.extractMode,
    });
  }

  get(url: string, options?: FetchOptions): FetchResult | null {
    const key = this.getCacheKey(url, options);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return { ...entry.result };
  }

  set(url: string, result: FetchResult, ttlMs: number, options?: FetchOptions): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const key = this.getCacheKey(url, options);
    this.cache.set(key, {
      result,
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

  delete(url: string, options?: FetchOptions): boolean {
    const key = this.getCacheKey(url, options);
    return this.cache.delete(key);
  }
}

export class FetchRuntime {
  private config: FetchRuntimeConfig;
  private cache: FetchCache;

  constructor(config?: Partial<FetchRuntimeConfig>) {
    this.config = { ...DEFAULT_FETCH_CONFIG, ...config };
    this.cache = new FetchCache(this.config.maxCacheSize);
  }

  getConfig(): FetchRuntimeConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<FetchRuntimeConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxCacheSize !== undefined) {
      this.cache = new FetchCache(config.maxCacheSize);
    }
  }

  getCache(): FetchCache {
    return this.cache;
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    const startTime = Date.now();
    const normalizedOptions = this.normalizeOptions(options);

    this.validateUrl(url);

    if (normalizedOptions.useCache && this.config.cacheEnabled) {
      const cached = this.cache.get(url, normalizedOptions);
      if (cached) {
        logger.debug(`Fetch cache hit for: ${url}`);
        return { ...cached, extractedAt: new Date().toISOString() };
      }
    }

    const result = await this.fetchWithRetry(url, normalizedOptions);

    if (normalizedOptions.useCache && this.config.cacheEnabled) {
      this.cache.set(url, result, normalizedOptions.cacheTtlMs || this.config.defaultCacheTtlMs, normalizedOptions);
    }

    const finalResult: FetchResult = {
      ...result,
      extractedAt: new Date().toISOString(),
    };

    logger.debug(`Fetch completed in ${Date.now() - startTime}ms for: ${url}`);
    return finalResult;
  }

  private async fetchWithRetry(url: string, options: FetchOptions): Promise<FetchResult> {
    const maxRetries = options.maxRetries ?? this.config.defaultMaxRetries;
    const retryDelayMs = options.retryDelayMs ?? this.config.defaultRetryDelayMs;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.doFetch(url, options);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        logger.warn(`Fetch attempt ${attempt + 1}/${maxRetries + 1} failed for ${url}: ${lastError.message}`);

        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Fetch failed');
  }

  private async doFetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.config.defaultTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const abortHandler = () => controller.abort();
    options.signal?.addEventListener('abort', abortHandler);

    try {
      const headers: Record<string, string> = {
        'User-Agent': options.userAgent || this.config.defaultUserAgent,
        'Accept-Language': options.acceptLanguage || this.config.defaultAcceptLanguage,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };

      const fetchOptions: RequestInit = {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      };

      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortHandler);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'text/html';
      const charset = this.extractCharset(contentType);

      let content = await response.text();

      if (charset && charset.toLowerCase() !== 'utf-8' && charset.toLowerCase() !== 'utf8') {
        content = this.recodeContent(content, charset);
      }

      let title: string | undefined;
      let finalContent = content;
      let truncated = false;
      const maxContentLength = options.maxContentLength || this.config.defaultMaxContentLength;

      if (content.length > maxContentLength) {
        finalContent = content.slice(0, maxContentLength);
        truncated = true;
      }

      if (options.extractContent) {
        const extractResult = await extractContent({
          html: content,
          url,
          extractMode: options.extractMode || 'text',
          maxLength: maxContentLength,
          extractTitle: true,
          extractMetadata: true,
        });

        if (extractResult) {
          finalContent = extractResult.content;
          title = extractResult.title;
          truncated = extractResult.truncated;
        }
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      return {
        url,
        finalUrl: response.url,
        title,
        contentType,
        content: finalContent,
        contentLength: finalContent.length,
        truncated,
        rendered: false,
        provider: 'native-fetch',
        statusCode: response.status,
        headers: responseHeaders,
        charset,
      };
    } catch (e) {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortHandler);

      if (e instanceof DOMException && e.name === 'AbortError') {
        if (options.signal?.aborted) {
          throw e;
        }
        throw new Error(`Fetch timed out after ${timeoutMs}ms`);
      }
      throw e;
    }
  }

  private validateUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Only HTTP')) {
        throw e;
      }
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  private normalizeOptions(options?: FetchOptions): FetchOptions {
    return {
      timeoutMs: options?.timeoutMs || this.config.defaultTimeoutMs,
      maxRetries: options?.maxRetries ?? this.config.defaultMaxRetries,
      retryDelayMs: options?.retryDelayMs ?? this.config.defaultRetryDelayMs,
      useCache: options?.useCache ?? true,
      cacheTtlMs: options?.cacheTtlMs || this.config.defaultCacheTtlMs,
      useProxy: options?.useProxy ?? this.config.proxyEnabled,
      proxyType: options?.proxyType || (this.config.defaultProxyType === 'none' ? 'auto' : this.config.defaultProxyType),
      userAgent: options?.userAgent || this.config.defaultUserAgent,
      acceptLanguage: options?.acceptLanguage || this.config.defaultAcceptLanguage,
      maxContentLength: options?.maxContentLength || this.config.defaultMaxContentLength,
      renderJavaScript: options?.renderJavaScript ?? false,
      waitForSelector: options?.waitForSelector,
      extractContent: options?.extractContent ?? false,
      extractMode: options?.extractMode || 'text',
      signal: options?.signal,
    };
  }

  private extractCharset(contentType: string): string | undefined {
    const match = contentType.match(/charset=([^;\s]+)/i);
    return match ? match[1].trim() : undefined;
  }

  private recodeContent(_content: string, _charset: string): string {
    return _content;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clearCache(): void {
    this.cache.clear();
    logger.debug('Fetch cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size();
  }

  getProxyManager(): typeof proxyManager {
    return proxyManager;
  }
}

export const fetchRuntime = new FetchRuntime();
