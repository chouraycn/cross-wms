/**
 * Firecrawl Web Search Provider — Firecrawl 搜索 Provider 实现
 *
 * 基于 Firecrawl API 的搜索 Provider，支持搜索和网页抓取。
 */

import type {
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderContext,
  WebSearchResultList,
  WebSearchResult,
} from "../web-provider-types.js";
import { registerWebSearchProvider } from "../web-search-providers.js";

// ==================== 缓存 ====================

interface CacheEntry {
  results: WebSearchResultList;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 200;
const cache = new Map<string, CacheEntry>();

function getCacheKey(query: string, limit: number, searchOptions?: string): string {
  return `${query.toLowerCase()}:${limit}:${searchOptions || ""}`;
}

function getFromCache(key: string): WebSearchResultList | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function setInCache(key: string, results: WebSearchResultList): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, { results, timestamp: Date.now() });
}

// ==================== 凭证辅助 ====================

function getApiKey(searchConfig?: Record<string, unknown>): string | undefined {
  if (searchConfig) {
    const configValue = searchConfig.apiKey;
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      return String(configValue);
    }
  }
  const envValue = process.env.FIRECRAWL_API_KEY;
  if (envValue && envValue !== "") {
    return envValue;
  }
  return undefined;
}

// ==================== 结果扩展类型 ====================

interface FirecrawlResult extends WebSearchResult {
  description?: string;
}

interface FirecrawlSearchResponse {
  success: boolean;
  data?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    description?: string;
  }>;
  error?: string;
}

// ==================== 搜索执行 ====================

async function performSearch(
  query: string,
  limit: number,
  apiKey: string,
  searchOptions?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, limit, JSON.stringify(searchOptions || {}));
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const body: Record<string, unknown> = {
      query,
      limit,
    };

    if (searchOptions && Object.keys(searchOptions).length > 0) {
      body.searchOptions = searchOptions;
    }

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Firecrawl 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as FirecrawlSearchResponse;

    if (!data.success) {
      throw new Error(`Firecrawl 搜索失败: ${data.error || "Unknown error"}`);
    }

    const rawResults = data.data || [];

    const results: FirecrawlResult[] = [];
    for (const raw of rawResults) {
      if (results.length >= limit) break;
      const title = raw.title || raw.url || "Untitled";
      const url = raw.url || "";
      const snippet = raw.snippet || raw.description || "";
      const description = raw.description;
      if (title && url) {
        results.push({ title, url, snippet, description });
      }
    }

    const resultList: WebSearchResultList & { results: FirecrawlResult[] } = {
      query,
      results,
      count: results.length,
      provider: "firecrawl",
    };

    setInCache(cacheKey, resultList);
    return resultList;
  } catch (e) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (e instanceof DOMException && e.name === "AbortError") {
      if (signal?.aborted) {
        throw e;
      }
      throw new Error("Firecrawl 搜索超时（10秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "firecrawl",
  label: "Firecrawl",
  hint: "Firecrawl search + scrape",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["FIRECRAWL_API_KEY"],
  placeholder: "fc-...",
  signupUrl: "https://www.firecrawl.dev/",
  docsUrl: "https://docs.firecrawl.dev/api-reference/endpoint/search",
  autoDetectOrder: 55,
  credentialPath: "tools.web.search.providers.firecrawl.apiKey",
  inactiveSecretPaths: [],

  getCredentialValue(searchConfig?: Record<string, unknown>): unknown {
    if (!searchConfig) return undefined;
    return searchConfig.apiKey;
  },

  setCredentialValue(searchConfigTarget: Record<string, unknown>, value: unknown): void {
    searchConfigTarget.apiKey = value;
  },

  createTool(ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    const apiKey = getApiKey(ctx.searchConfig);
    if (!apiKey) {
      return null;
    }

    return {
      description: "Search the web using Firecrawl, which also supports scraping web pages.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
            default: 8,
          },
          searchOptions: {
            type: "object",
            description: "Additional search options (e.g. lang, country, safeSearch)",
            additionalProperties: true,
          },
        },
        required: ["query"],
      },
      async execute(
        args: Record<string, unknown>,
        context?: { signal?: AbortSignal },
      ): Promise<WebSearchResultList> {
        const query = String(args.query || "").trim();
        if (!query) {
          throw new Error("搜索关键词不能为空");
        }

        const limit = Math.min(Number(args.limit) || 8, 50);
        const searchOptions =
          args.searchOptions && typeof args.searchOptions === "object"
            ? (args.searchOptions as Record<string, unknown>)
            : undefined;

        return performSearch(query, limit, apiKey, searchOptions, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("firecrawl", plugin);

export default plugin;
