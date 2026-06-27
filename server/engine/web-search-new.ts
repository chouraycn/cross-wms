/**
 * Web Search — 网页搜索主工具 (v3.0)
 *
 * 功能特性：
 * - 整合 Provider 插件系统
 * - 自动选择可用 Provider
 * - 结果规范化（统一格式）
 * - 缓存机制（内存缓存 + TTL）
 * - 信号取消支持
 * - 进度回调
 */

import { z } from "zod";
import { logger } from "../logger.js";
import {
  getWebSearchProviders,
  sortWebSearchProvidersForAutoDetect,
  resolveWebSearchCredential,
} from "../plugins/web-search-providers.js";
import type {
  PluginWebSearchProviderEntry,
  WebSearchResultList,
  WebSearchResult,
} from "../plugins/web-provider-types.js";
import { fetchWithWebToolsNetworkGuard } from "./web-guarded-fetch.js";
import * as cheerio from "cheerio";

// ==================== 常量 ====================

export const DEFAULT_SEARCH_MAX_RESULTS = 10;
export const DEFAULT_SEARCH_TIMEOUT_MS = 30000;
export const DEFAULT_SEARCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

// ==================== 参数 Schema ====================

export const webSearchParamsSchema = z.object({
  query: z
    .string({
      message: "invalid",
    })
    .min(1, "query must not be empty")
    .max(1000, "query must be at most 1000 characters")
    .describe("The search query string"),

  maxResults: z
    .number({
      message: "invalid",
    })
    .int("maxResults must be an integer")
    .min(1, "maxResults must be at least 1")
    .max(50, "maxResults must be at most 50")
    .default(DEFAULT_SEARCH_MAX_RESULTS)
    .describe(`Maximum number of search results (default: ${DEFAULT_SEARCH_MAX_RESULTS})`),

  timeoutMs: z
    .number({
      message: "invalid",
    })
    .min(1000, "timeoutMs must be at least 1000")
    .max(120000, "timeoutMs must be at most 120000")
    .default(DEFAULT_SEARCH_TIMEOUT_MS)
    .describe(`Request timeout in milliseconds (default: ${DEFAULT_SEARCH_TIMEOUT_MS})`),

  userAgent: z
    .string({
      message: "invalid",
    })
    .default(DEFAULT_SEARCH_USER_AGENT)
    .describe("User-Agent header value"),

  preferredProvider: z
    .string({
      message: "invalid",
    })
    .optional()
    .describe("Preferred search provider ID to use first"),

  useCache: z
    .boolean({
      message: "invalid",
    })
    .default(true)
    .describe("Whether to use response cache (default: true)"),

  cacheTtlMs: z
    .number({
      message: "invalid",
    })
    .min(0, "cacheTtlMs must be at least 0")
    .default(DEFAULT_CACHE_TTL_MS)
    .describe(`Cache TTL in milliseconds (default: ${DEFAULT_CACHE_TTL_MS})`),

  renderJs: z
    .boolean({
      message: "invalid",
    })
    .default(false)
    .describe("Whether to render JavaScript for search results (default: false)"),

  safeSearch: z
    .enum(["off", "moderate", "strict"], {
      message: "invalid",
    })
    .default("moderate")
    .describe("Safe search level (default: moderate)"),

  language: z
    .string({
      message: "invalid",
    })
    .default("en")
    .describe("Search result language (default: en)"),

  region: z
    .string({
      message: "invalid",
    })
    .optional()
    .describe("Search region/country code"),

  timeRange: z
    .enum(["day", "week", "month", "year", "any"], {
      message: "invalid",
    })
    .default("any")
    .describe("Time range for results (default: any)"),

  site: z
    .string({
      message: "invalid",
    })
    .optional()
    .describe("Limit results to a specific site/domain"),

  fileType: z
    .string({
      message: "invalid",
    })
    .optional()
    .describe("Limit results to a specific file type (e.g., pdf, docx)"),

  onlyPluginIds: z
    .array(z.string(), {
      message: "invalid",
    })
    .optional()
    .describe("Only use providers from these plugin IDs"),

  retries: z
    .number({
      message: "invalid",
    })
    .int("retries must be an integer")
    .min(0, "retries must be at least 0")
    .max(3, "retries must be at most 3")
    .default(1)
    .describe("Number of retries on failure (default: 1)"),

  retryDelayMs: z
    .number({
      message: "invalid",
    })
    .min(0, "retryDelayMs must be at least 0")
    .default(500)
    .describe("Delay between retries in milliseconds (default: 500)"),

  priority: z
    .enum(["low", "normal", "high"], {
      message: "invalid",
    })
    .default("normal")
    .describe("Request priority (default: normal)"),

  metadata: z
    .record(z.string(), z.unknown(), {
      message: "invalid",
    })
    .optional()
    .describe("Additional metadata to pass to providers"),

  includeRawResults: z
    .boolean({
      message: "invalid",
    })
    .default(false)
    .describe("Whether to include raw provider results (default: false)"),
});

export type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

// ==================== 进度回调 ====================

export type WebSearchProgressStage =
  | "validating"
  | "checking_cache"
  | "resolving_provider"
  | "searching"
  | "normalizing"
  | "complete";

export interface WebSearchProgress {
  stage: WebSearchProgressStage;
  query: string;
  percent?: number;
  message?: string;
  provider?: string;
  resultCount?: number;
}

export type WebSearchProgressCallback = (progress: WebSearchProgress) => void;

// ==================== 缓存实现 ====================

interface CacheEntry {
  result: WebSearchResultList;
  timestamp: number;
}

class WebSearchCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number = MAX_CACHE_ENTRIES;

  get(key: string, ttlMs: number): WebSearchResultList | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(key: string, result: WebSearchResultList): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const searchCache = new WebSearchCache();

function getCacheKey(query: string, params: WebSearchParams): string {
  const keyParts = [
    query.toLowerCase().trim(),
    String(params.maxResults),
    params.safeSearch,
    params.language,
    params.region || "",
    params.timeRange,
    params.site || "",
    params.fileType || "",
  ];
  return keyParts.join("|");
}

// ==================== 结果规范化 ====================

function normalizeResults(
  results: WebSearchResult[],
  maxResults: number,
): WebSearchResult[] {
  const normalized: WebSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const result of results) {
    if (!result.url || !result.title) continue;

    let normalizedUrl = result.url;
    try {
      const parsed = new URL(result.url);
      parsed.hash = "";
      normalizedUrl = parsed.toString();
    } catch {
      // 无效 URL，跳过
      continue;
    }

    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

    normalized.push({
      title: result.title.trim().substring(0, 200),
      url: normalizedUrl,
      snippet: result.snippet?.trim().substring(0, 500),
    });

    if (normalized.length >= maxResults) break;
  }

  return normalized;
}

// ==================== DuckDuckGo HTML 搜索（无 Provider 时的 fallback）

async function duckDuckGoSearch(
  params: WebSearchParams,
  signal?: AbortSignal,
  onProgress?: WebSearchProgressCallback,
): Promise<WebSearchResultList> {
  const { query, maxResults, timeoutMs, userAgent, language } = params;

  onProgress?.({
    stage: "searching",
    query,
    provider: "duckduckgo",
    message: "Searching with DuckDuckGo...",
  });

  const encodedQuery = encodeURIComponent(query);
  let url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  if (language && language !== "en") {
    url += `&kl=${encodeURIComponent(language)}`;
  }

  const fetchResult = await fetchWithWebToolsNetworkGuard({
    url,
    mode: "trusted",
    options: {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html",
        "Accept-Language": language,
      },
      signal,
    },
    timeoutMs,
    maxResponseBodySize: 5 * 1024 * 1024,
    userAgent,
  });

  const { response, release } = fetchResult;

  if (!response.ok) {
    release?.();
    throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  release?.();
  const $ = cheerio.load(html);

  const results: WebSearchResult[] = [];

  $(".result").each((_, elem) => {
    const $elem = $(elem);
    const title = $elem.find(".result__a").text().trim();
    const href = $elem.find(".result__a").attr("href") || "";
    const snippet = $elem.find(".result__snippet").text().trim();

    if (!title || !href) return;

    let finalUrl = href;
    if (href.startsWith("//")) {
      finalUrl = "https:" + href;
    } else if (href.startsWith("/l/?uddg=")) {
      const match = href.match(/uddg=([^&]+)/);
      if (match) {
        finalUrl = decodeURIComponent(match[1]);
      }
    }

    results.push({
      title,
      url: finalUrl,
      snippet: snippet || undefined,
    });
  });

  if (results.length === 0) {
    $("a.result__a").each((_, elem) => {
      const $elem = $(elem);
      const title = $elem.text().trim();
      const href = $elem.attr("href") || "";

      if (!title || !href) return;

      let finalUrl = href;
      if (href.startsWith("//")) {
        finalUrl = "https:" + href;
      } else if (href.startsWith("/l/?uddg=")) {
        const match = href.match(/uddg=([^&]+)/);
        if (match) {
          finalUrl = decodeURIComponent(match[1]);
        }
      }

      results.push({
        title,
        url: finalUrl,
      });
    });
  }

  const normalized = normalizeResults(results, maxResults);

  onProgress?.({
    stage: "normalizing",
    query,
    resultCount: normalized.length,
    message: `Found ${normalized.length} results`,
  });

  return {
    query,
    results: normalized,
    count: normalized.length,
    provider: "duckduckgo",
  };
}

// ==================== Provider 回退链执行 ====================

interface SearchFallbackResult {
  result: WebSearchResultList | null;
  providerUsed: string | null;
  errors: Array<{ providerId: string; error: string }>;
}

async function executeWithSearchFallback(
  chain: PluginWebSearchProviderEntry[],
  params: WebSearchParams,
  signal?: AbortSignal,
  onProgress?: WebSearchProgressCallback,
  searchConfig?: Record<string, unknown>,
): Promise<SearchFallbackResult> {
  const errors: Array<{ providerId: string; error: string }> = [];

  for (const provider of chain) {
    if (signal?.aborted) {
      const error = new Error("搜索已取消");
      error.name = "AbortError";
      throw error;
    }

    try {
      const tool = provider.createTool({
        searchConfig,
      });

      if (!tool) {
        errors.push({
          providerId: provider.id,
          error: "Provider tool creation returned null",
        });
        continue;
      }

      onProgress?.({
        stage: "searching",
        query: params.query,
        provider: provider.id,
        message: `Searching with ${provider.label}...`,
      });

      const providerArgs: Record<string, unknown> = {
        query: params.query,
        maxResults: params.maxResults,
        timeoutMs: params.timeoutMs,
        userAgent: params.userAgent,
        language: params.language,
        region: params.region,
        safeSearch: params.safeSearch,
        timeRange: params.timeRange,
        site: params.site,
        fileType: params.fileType,
        ...(params.metadata || {}),
      };

      const result = await tool.execute(providerArgs, { signal });

      if (result) {
        return { result, providerUsed: provider.id, errors };
      }

      errors.push({
        providerId: provider.id,
        error: "No result returned",
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push({ providerId: provider.id, error: errorMsg });
      logger.warn(`[WebSearch] Provider ${provider.id} failed:`, errorMsg);
    }
  }

  return { result: null, providerUsed: null, errors };
}

// ==================== 主函数 ====================

export interface WebSearchOptions {
  signal?: AbortSignal;
  onProgress?: WebSearchProgressCallback;
  searchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export async function webSearch(
  params: WebSearchParams,
  options: WebSearchOptions = {},
): Promise<WebSearchResultList> {
  const { signal: externalSignal, onProgress, searchConfig, config } = options;

  const totalTimeoutMs = params.timeoutMs || DEFAULT_SEARCH_TIMEOUT_MS;
  const totalController = new AbortController();
  const totalTimeoutId = setTimeout(() => {
    totalController.abort();
  }, totalTimeoutMs);

  const signal = externalSignal
    ? AbortSignal.any([externalSignal, totalController.signal])
    : totalController.signal;

  const cleanup = () => {
    clearTimeout(totalTimeoutId);
  };

  try {
    return await webSearchInternal(params, { signal, onProgress, searchConfig, config });
  } catch (e) {
    cleanup();
    if (e instanceof DOMException && e.name === "AbortError") {
      if (totalController.signal.aborted && !externalSignal?.aborted) {
        throw new Error(`搜索超时（${totalTimeoutMs / 1000}秒），请稍后重试或缩短搜索范围`);
      }
    }
    throw e;
  }
}

async function webSearchInternal(
  params: WebSearchParams,
  options: WebSearchOptions = {},
): Promise<WebSearchResultList> {
  const { signal, onProgress, searchConfig, config } = options;

  onProgress?.({
    stage: "validating",
    query: params.query,
    message: "Validating search query...",
  });

  const validated = webSearchParamsSchema.parse(params);

  if (signal?.aborted) {
    throw new Error("Search aborted");
  }

  const cacheKey = getCacheKey(validated.query, validated);

  if (validated.useCache) {
    onProgress?.({
      stage: "checking_cache",
      query: validated.query,
      message: "Checking cache...",
    });
    const cached = searchCache.get(cacheKey, validated.cacheTtlMs);
    if (cached) {
      onProgress?.({
        stage: "complete",
        query: validated.query,
        percent: 100,
        resultCount: cached.count,
        message: "Returning cached results",
      });
      logger.debug("[WebSearch] Cache hit:", validated.query);
      return {
        ...cached,
        results: cached.results.slice(0, validated.maxResults),
        count: Math.min(cached.count, validated.maxResults),
      };
    }
  }

  onProgress?.({
    stage: "resolving_provider",
    query: validated.query,
    message: "Resolving search provider...",
  });

  const allProviders = getWebSearchProviders({
    onlyPluginIds: validated.onlyPluginIds,
  });

  let chain: PluginWebSearchProviderEntry[] = [];

  if (validated.preferredProvider) {
    const preferred = allProviders.find((p) => p.id === validated.preferredProvider);
    if (preferred) {
      const others = allProviders.filter((p) => p.id !== validated.preferredProvider);
      chain = [preferred, ...sortWebSearchProvidersForAutoDetect(others)];
    } else {
      chain = sortWebSearchProvidersForAutoDetect(allProviders);
    }
  } else {
    const providersWithCredentials: PluginWebSearchProviderEntry[] = [];
    const providersWithoutCredentials: PluginWebSearchProviderEntry[] = [];

    for (const provider of sortWebSearchProvidersForAutoDetect(allProviders)) {
      const credential = resolveWebSearchCredential({
        provider,
        searchConfig,
        config,
      });

      if (credential.source !== "missing" || !provider.requiresCredential) {
        providersWithCredentials.push(provider);
      } else {
        providersWithoutCredentials.push(provider);
      }
    }

    chain = [...providersWithCredentials, ...providersWithoutCredentials];
  }

  logger.debug(
    `[WebSearch] Fallback chain for "${validated.query}": ${chain.map((p) => p.id).join(", ")}`,
  );

  let result: WebSearchResultList | null = null;
  let providerUsed: string | null = null;

  if (chain.length > 0) {
    const fallbackResult = await executeWithSearchFallback(
      chain,
      validated,
      signal,
      onProgress,
      searchConfig,
    );
    result = fallbackResult.result;
    providerUsed = fallbackResult.providerUsed;
  }

  if (!result) {
    if (signal?.aborted) {
      const error = new Error("搜索已取消");
      error.name = "AbortError";
      throw error;
    }
    logger.debug("[WebSearch] No provider succeeded, falling back to DuckDuckGo");
    result = await duckDuckGoSearch(validated, signal, onProgress);
    providerUsed = "duckduckgo";
  }

  onProgress?.({
    stage: "normalizing",
    query: validated.query,
    provider: providerUsed || undefined,
    message: "Normalizing results...",
  });

  const normalizedResults = normalizeResults(result.results, validated.maxResults);

  const finalResult: WebSearchResultList = {
    query: validated.query,
    results: normalizedResults,
    count: normalizedResults.length,
    provider: providerUsed || result.provider,
  };

  if (validated.useCache && finalResult.count > 0) {
    searchCache.set(cacheKey, finalResult);
  }

  onProgress?.({
    stage: "complete",
    query: validated.query,
    percent: 100,
    provider: finalResult.provider,
    resultCount: finalResult.count,
    message: `Search complete: ${finalResult.count} results`,
  });

  return finalResult;
}

// ==================== 工具处理函数（用于 toolRegistry） ====================

export async function handleWebSearchV3(args: Record<string, unknown>): Promise<string> {
  try {
    const result = await webSearch(args as WebSearchParams);
    return JSON.stringify({
      success: true,
      ...result,
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ==================== 缓存管理导出 ====================

export const webSearchCache = {
  clear: () => searchCache.clear(),
  size: () => searchCache.size(),
};

// ==================== Tool Definition 导出 ====================

export function getWebSearchToolDefinition() {
  return {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the web for up-to-date information. Uses a provider plugin system with automatic fallback, result normalization, caching, and progress tracking. Supports multiple search providers with automatic selection based on available credentials.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query string",
          },
          maxResults: {
            type: "number",
            description: `Maximum number of search results (default: ${DEFAULT_SEARCH_MAX_RESULTS})`,
            default: DEFAULT_SEARCH_MAX_RESULTS,
          },
          timeoutMs: {
            type: "number",
            description: `Request timeout in milliseconds (default: ${DEFAULT_SEARCH_TIMEOUT_MS})`,
            default: DEFAULT_SEARCH_TIMEOUT_MS,
          },
          userAgent: {
            type: "string",
            description: "User-Agent header value",
            default: DEFAULT_SEARCH_USER_AGENT,
          },
          preferredProvider: {
            type: "string",
            description: "Preferred search provider ID to use first",
          },
          useCache: {
            type: "boolean",
            description: "Whether to use response cache (default: true)",
            default: true,
          },
          cacheTtlMs: {
            type: "number",
            description: `Cache TTL in milliseconds (default: ${DEFAULT_CACHE_TTL_MS})`,
            default: DEFAULT_CACHE_TTL_MS,
          },
          renderJs: {
            type: "boolean",
            description: "Whether to render JavaScript for search results (default: false)",
            default: false,
          },
          safeSearch: {
            type: "string",
            enum: ["off", "moderate", "strict"],
            description: "Safe search level (default: moderate)",
            default: "moderate",
          },
          language: {
            type: "string",
            description: "Search result language (default: en)",
            default: "en",
          },
          region: {
            type: "string",
            description: "Search region/country code",
          },
          timeRange: {
            type: "string",
            enum: ["day", "week", "month", "year", "any"],
            description: "Time range for results (default: any)",
            default: "any",
          },
          site: {
            type: "string",
            description: "Limit results to a specific site/domain",
          },
          fileType: {
            type: "string",
            description: "Limit results to a specific file type (e.g., pdf, docx)",
          },
          onlyPluginIds: {
            type: "array",
            items: { type: "string" },
            description: "Only use providers from these plugin IDs",
          },
          retries: {
            type: "number",
            description: "Number of retries on failure (default: 1)",
            default: 1,
          },
          retryDelayMs: {
            type: "number",
            description: "Delay between retries in milliseconds (default: 500)",
            default: 500,
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Request priority (default: normal)",
            default: "normal",
          },
          metadata: {
            type: "object",
            additionalProperties: {},
            description: "Additional metadata to pass to providers",
          },
          includeRawResults: {
            type: "boolean",
            description: "Whether to include raw provider results (default: false)",
            default: false,
          },
        },
        required: ["query"],
      },
    },
  };
}
