/**
 * SearXNG Web Search Provider — SearXNG 元搜索 Provider 实现
 *
 * 基于 SearXNG 隐私元搜索引擎的搜索 Provider，
 * 支持多引擎聚合搜索，尊重用户隐私。
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

function getCacheKey(
  query: string,
  count: number,
  language?: string,
  categories?: string,
  engines?: string,
): string {
  return `${query.toLowerCase()}:${count}:${language || ""}:${categories || ""}:${engines || ""}`;
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

function getBaseUrl(searchConfig?: Record<string, unknown>): string | undefined {
  if (searchConfig) {
    const configValue = searchConfig.baseUrl;
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      return String(configValue).replace(/\/$/, "");
    }
  }
  const envValue = process.env.SEARXNG_BASE_URL;
  if (envValue && envValue !== "") {
    return envValue.replace(/\/$/, "");
  }
  return undefined;
}

function getApiKey(searchConfig?: Record<string, unknown>): string | undefined {
  if (searchConfig) {
    const configValue = searchConfig.apiKey;
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      return String(configValue);
    }
  }
  const envValue = process.env.SEARXNG_API_KEY;
  if (envValue && envValue !== "") {
    return envValue;
  }
  return undefined;
}

// ==================== 结果扩展类型 ====================

interface SearXNGResult extends WebSearchResult {
  engine?: string;
}

interface SearXNGResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
    engine?: string;
    engines?: string[];
  }>;
  query?: string;
  number_of_results?: number;
}

// ==================== 搜索执行 ====================

async function performSearch(
  query: string,
  count: number,
  baseUrl: string,
  apiKey?: string,
  language?: string,
  categories?: string,
  engines?: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, language, categories, engines);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
    });

    if (language) {
      params.set("language", language);
    }
    if (categories) {
      params.set("categories", categories);
    }
    if (engines) {
      params.set("engines", engines);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "CrossWMS-AI/1.0",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      throw new Error(`SearXNG 搜索请求失败: HTTP ${response.status}`);
    }

    const data = (await response.json()) as SearXNGResponse;
    const rawResults = data.results || [];

    const results: SearXNGResult[] = [];
    for (const raw of rawResults) {
      if (results.length >= count) break;
      const title = raw.title || raw.url || "Untitled";
      const url = raw.url || "";
      const snippet = raw.content || raw.snippet || "";
      const engine = raw.engine || (raw.engines && raw.engines.length > 0 ? raw.engines.join(",") : undefined);
      if (title && url) {
        results.push({ title, url, snippet, engine });
      }
    }

    const resultList: WebSearchResultList & { results: SearXNGResult[] } = {
      query,
      results,
      count: results.length,
      provider: "searxng",
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
      throw new Error("SearXNG 搜索超时（10秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "searxng",
  label: "SearXNG",
  hint: "Privacy-respecting metasearch",
  requiresCredential: false,
  envVars: ["SEARXNG_BASE_URL", "SEARXNG_API_KEY"],
  placeholder: "https://searxng.example.com",
  signupUrl: "https://searxng.org/",
  docsUrl: "https://docs.searxng.org/dev/search_api.html",
  autoDetectOrder: 65,
  credentialPath: "tools.web.search.providers.searxng.baseUrl",
  inactiveSecretPaths: [],

  getCredentialValue(searchConfig?: Record<string, unknown>): unknown {
    if (!searchConfig) return undefined;
    return searchConfig.baseUrl;
  },

  setCredentialValue(searchConfigTarget: Record<string, unknown>, value: unknown): void {
    searchConfigTarget.baseUrl = value;
  },

  createTool(ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    const baseUrl = getBaseUrl(ctx.searchConfig);
    if (!baseUrl) {
      return null;
    }
    const apiKey = getApiKey(ctx.searchConfig);

    return {
      description: "Search the web using SearXNG, a privacy-respecting metasearch engine.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          count: {
            type: "number",
            description: "Maximum number of results to return",
            default: 8,
          },
          language: {
            type: "string",
            description: "Language code for results (e.g. en, zh, all)",
          },
          categories: {
            type: "string",
            description: "Search categories (e.g. general, news, images, videos)",
          },
          engines: {
            type: "string",
            description: "Comma-separated list of engines to use (e.g. google,duckduckgo,bing)",
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

        const count = Math.min(Number(args.count) || 8, 50);
        const language = args.language ? String(args.language) : undefined;
        const categories = args.categories ? String(args.categories) : undefined;
        const engines = args.engines ? String(args.engines) : undefined;

        return performSearch(query, count, baseUrl, apiKey, language, categories, engines, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("searxng", plugin);

export default plugin;
