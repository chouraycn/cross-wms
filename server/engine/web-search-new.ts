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
import { getSecretValueByKey } from "./secretsStore.js";

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

/**
 * v3.1: 搜索结果相关性校验
 * 检查返回结果中是否有足够的结果包含查询词中的核心关键词。
 * 用于识别搜索引擎反爬/降级返回的不相关结果。
 */
function isSearchResultRelevant(
  resultList: WebSearchResultList,
  query: string,
  minMatches: number = 2,
  minMatchRatio: number = 0.3,
): boolean {
  if (!resultList.results || resultList.results.length === 0) return false;

  // 提取查询词中的核心关键词（长度 >= 2 的中文/英文词）
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\u4e00-\u9fa5a-z0-9]/gi, ""))
    .filter((w) => w.length >= 2);

  if (keywords.length === 0) return true;

  let matchedCount = 0;
  for (const result of resultList.results) {
    const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
    // 至少匹配一个关键词即认为该条结果相关
    const hasMatch = keywords.some((kw) => text.includes(kw));
    if (hasMatch) matchedCount++;
  }

  const total = resultList.results.length;
  const ratio = total > 0 ? matchedCount / total : 0;
  return matchedCount >= minMatches || ratio >= minMatchRatio;
}

// ==================== 国内搜索引擎 fallback（无 Provider 时使用）

/**
 * 必应国内版搜索（cn.bing.com）
 * 主要 fallback，国内网络友好
 */
async function bingCnSearch(
  params: WebSearchParams,
  signal?: AbortSignal,
  onProgress?: WebSearchProgressCallback,
): Promise<WebSearchResultList> {
  const { query, maxResults, timeoutMs, userAgent, language } = params;

  onProgress?.({
    stage: "searching",
    query,
    provider: "bing-cn",
    message: "正在使用必应国内版搜索...",
  });

  const encodedQuery = encodeURIComponent(query);
  // cn.bing.com 搜索 URL
  const url = `https://cn.bing.com/search?q=${encodedQuery}&count=${maxResults * 2}`;

  const fetchResult = await fetchWithWebToolsNetworkGuard({
    url,
    mode: "trusted",
    options: {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": language || "zh-CN,zh;q=0.9,en;q=0.8",
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
    throw new Error(`必应搜索失败: HTTP ${response.status}`);
  }

  const html = await response.text();
  release?.();
  const $ = cheerio.load(html);

  const results: WebSearchResult[] = [];

  // 必应搜索结果选择器
  $("#b_results > li.b_algo").each((_, elem) => {
    const $elem = $(elem);
    const $title = $elem.find("h2 > a");
    const title = $title.text().trim();
    const href = $title.attr("href") || "";
    const snippet = $elem.find(".b_caption p").text().trim() || $elem.find("p").text().trim();

    if (!title || !href) return;

    results.push({
      title,
      url: href,
      snippet: snippet || undefined,
    });
  });

  // 备用选择器
  if (results.length === 0) {
    $("li.b_algo h2 a").each((_, elem) => {
      const $elem = $(elem);
      const title = $elem.text().trim();
      const href = $elem.attr("href") || "";

      if (!title || !href) return;

      results.push({
        title,
        url: href,
      });
    });
  }

  const normalized = normalizeResults(results, maxResults);

  onProgress?.({
    stage: "normalizing",
    query,
    resultCount: normalized.length,
    message: `找到 ${normalized.length} 个结果`,
  });

  return {
    query,
    results: normalized,
    count: normalized.length,
    provider: "bing-cn",
  };
}

/**
 * 360搜索（so.com）
 * 国内回退搜索引擎
 */
async function soSearch(
  params: WebSearchParams,
  signal?: AbortSignal,
  onProgress?: WebSearchProgressCallback,
): Promise<WebSearchResultList> {
  const { query, maxResults, timeoutMs, userAgent, language } = params;

  onProgress?.({
    stage: "searching",
    query,
    provider: "so",
    message: "正在使用360搜索...",
  });

  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.so.com/s?q=${encodedQuery}`;

  const fetchResult = await fetchWithWebToolsNetworkGuard({
    url,
    mode: "trusted",
    options: {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": language || "zh-CN,zh;q=0.9,en;q=0.8",
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
    throw new Error(`360搜索失败: HTTP ${response.status}`);
  }

  const html = await response.text();
  release?.();
  const $ = cheerio.load(html);

  const results: WebSearchResult[] = [];

  // 360搜索结果选择器（v3.1: 精确到 res-list 下的单个结果，避免抓取到聚合容器）
  $("li.res-list, .result").each((_, elem) => {
    const $elem = $(elem);
    // 只取第一个 h3 > a，避免聚合块内多个标题被合并
    const $title = $elem.find("h3 > a").first();
    const title = $title.text().trim();
    let href = $title.attr("href") || "";

    if (!title || !href) return;

    // 过滤被聚合的标题（长度异常或包含大量省略号）
    if (title.length > 300 || title.split("…").length > 3) return;

    // 360 搜索结果 href 经常是跳转链接，需要解析真实 URL
    if (href.startsWith("/")) {
      try {
        const u = new URL(href, "https://www.so.com");
        href = u.toString();
      } catch {
        // ignore
      }
    }

    const snippet =
      $elem.find(".res-desc").first().text().trim() ||
      $elem.find(".content").first().text().trim() ||
      $elem.find("p").first().text().trim();

    results.push({
      title,
      url: href,
      snippet: snippet || undefined,
    });
  });

  // 备用选择器
  if (results.length === 0) {
    $("li.res-list h3 a, .result h3 a").each((_, elem) => {
      const $elem = $(elem);
      const title = $elem.text().trim();
      let href = $elem.attr("href") || "";

      if (!title || !href) return;
      if (title.length > 300 || title.split("…").length > 3) return;

      if (href.startsWith("/")) {
        try {
          const u = new URL(href, "https://www.so.com");
          href = u.toString();
        } catch {
          // ignore
        }
      }

      results.push({
        title,
        url: href,
      });
    });
  }

  const normalized = normalizeResults(results, maxResults);

  onProgress?.({
    stage: "normalizing",
    query,
    resultCount: normalized.length,
    message: `找到 ${normalized.length} 个结果`,
  });

  return {
    query,
    results: normalized,
    count: normalized.length,
    provider: "so",
  };
}

/**
 * 国内搜索引擎回退链
 * 优先级：必应国内版 > 360搜索 > 百度（HTML 解析模式）
 */
async function domesticSearchFallback(
  params: WebSearchParams,
  signal?: AbortSignal,
  onProgress?: WebSearchProgressCallback,
): Promise<WebSearchResultList> {
  const searchChain = [
    { name: "bing-cn", fn: bingCnSearch },
    { name: "so", fn: soSearch },
    { name: "baidu", fn: baiduHtmlSearch },
  ];

  for (const search of searchChain) {
    if (signal?.aborted) {
      throw new Error("搜索已取消");
    }

    try {
      const result = await search.fn(params, signal, onProgress);
      if (result.results.length > 0) {
        // v3.1: 增加相关性校验，识别反爬/降级返回的不相关结果
        if (isSearchResultRelevant(result, params.query)) {
          logger.debug(`[WebSearch] ${search.name} 返回 ${result.results.length} 条相关结果`);
          return result;
        }
        logger.warn(`[WebSearch] ${search.name} 返回 ${result.results.length} 条结果但相关度不足，继续 fallback`);
      } else {
        logger.debug(`[WebSearch] ${search.name} 返回空结果，尝试下一个搜索引擎`);
      }
    } catch (e) {
      logger.warn(`[WebSearch] ${search.name} 失败:`, e instanceof Error ? e.message : String(e));
      // 继续尝试下一个搜索引擎
    }
  }

  // 所有搜索引擎都失败
  return {
    query: params.query,
    results: [],
    count: 0,
    provider: "none",
  };
}

/**
 * 百度 HTML 搜索（国内搜索引擎回退）
 * 通过解析百度搜索结果页面获取搜索结果
 */
async function baiduHtmlSearch(
  params: WebSearchParams,
  signal?: AbortSignal,
  onProgress?: WebSearchProgressCallback,
): Promise<WebSearchResultList> {
  const { query, maxResults, timeoutMs, userAgent, language } = params;

  onProgress?.({
    stage: "searching",
    query,
    provider: "baidu",
    message: "正在使用百度搜索...",
  });

  const encodedQuery = encodeURIComponent(query);
  let url = `https://www.baidu.com/s?wd=${encodedQuery}&rn=${Math.min(maxResults * 2, 50)}`;

  if (language === "zh" || language === "zh-CN") {
    url += "&ct=2097152";
  }

  const fetchResult = await fetchWithWebToolsNetworkGuard({
    url,
    mode: "trusted",
    options: {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
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
    throw new Error(`百度搜索失败: HTTP ${response.status}`);
  }

  const html = await response.text();
  release?.();
  const $ = cheerio.load(html);

  const results: WebSearchResult[] = [];

  $(".result").each((_, elem) => {
    const $elem = $(elem);
    const $h3 = $elem.find("h3");
    if ($h3.length === 0) return;

    const $link = $h3.find("a");
    if ($link.length === 0) return;

    let rawUrl = $link.attr("href") || "";
    if (!rawUrl) return;

    if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;

    // 解析百度跳转链接
    if (rawUrl.includes("baidu.com/link?url=") || rawUrl.includes("baidu.com/link?wd=")) {
      try {
        const u = new URL(rawUrl);
        const target = u.searchParams.get("url");
        if (target) rawUrl = target;
      } catch {
        // ignore
      }
    }

    const title = $link.text().trim();
    let snippet = "";

    const snippetSelectors = [
      ".c-abstract",
      ".content-right",
      ".c-span-last",
      ".abstract",
      "div[class*='abstract']",
      "div[class*='content']",
    ];

    for (const sel of snippetSelectors) {
      const $snippet = $elem.find(sel);
      if ($snippet.length > 0) {
        const text = $snippet.text().trim();
        if (text.length > 10) {
          snippet = text;
          break;
        }
      }
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({ title, url: rawUrl, snippet: snippet || undefined });
    }
  });

  // 备用选择器
  if (results.length === 0) {
    $("h3 a").each((_, elem) => {
      const $elem = $(elem);
      const title = $elem.text().trim();
      let href = $elem.attr("href") || "";
      if (!title || !href) return;

      if (href.startsWith("//")) href = "https:" + href;

      if (!results.some((r) => r.url === href)) {
        results.push({ title, url: href, snippet: undefined });
      }
    });
  }

  const normalized = normalizeResults(results, maxResults);

  onProgress?.({
    stage: "normalizing",
    query,
    resultCount: normalized.length,
    message: `找到 ${normalized.length} 条结果`,
  });

  return {
    query,
    results: normalized,
    count: normalized.length,
    provider: "baidu",
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

      // v3.1: Provider 返回空结果（无实际搜索结果）时视为失败，继续 fallback
      if (result && Array.isArray(result.results) && result.results.length > 0) {
        return { result, providerUsed: provider.id, errors };
      }

      errors.push({
        providerId: provider.id,
        error: result && Array.isArray(result.results)
          ? `Provider returned empty results (count=${result.results.length})`
          : "No result returned",
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
    logger.debug("[WebSearch] No provider succeeded, falling back to domestic search engines");
    // 使用国内搜索引擎回退链：必应国内版 > 360搜索 > 百度
    result = await domesticSearchFallback(validated, signal, onProgress);
    providerUsed = result.provider;
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
    // 从 secrets DB 加载搜索 API Key，构建 searchConfig 传递给 Provider
    // Kimi 和 MiniMax 都从 searchConfig.apiKey 读取密钥
    // MiniMax 还需要 searchConfig.groupId
    const searchConfig: Record<string, unknown> = {};
    try {
      const kimiKey = getSecretValueByKey('encrypted', 'KIMI_API_KEY', 'web_search');
      if (kimiKey) {
        searchConfig.apiKey = kimiKey;
      }
      const minimaxKey = getSecretValueByKey('encrypted', 'MINIMAX_API_KEY', 'web_search');
      if (minimaxKey) {
        // Kimi 和 MiniMax 都从 searchConfig.apiKey 读取
        // 如果 Kimi key 已设置，MiniMax 会作为备选 provider 使用同一个 apiKey
        // 但如果只有 MiniMax key，也需要让它能读到
        if (!searchConfig.apiKey) {
          searchConfig.apiKey = minimaxKey;
        }
      }
      const minimaxGroupId = getSecretValueByKey('encrypted', 'MINIMAX_GROUP_ID', 'web_search');
      if (minimaxGroupId) {
        searchConfig.groupId = minimaxGroupId;
      }
    } catch {
      // secrets DB 未初始化或其他错误，忽略并继续（回退到免费引擎）
    }

    const result = await webSearch(args as WebSearchParams, {
      searchConfig: Object.keys(searchConfig).length > 0 ? searchConfig : undefined,
    });
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
