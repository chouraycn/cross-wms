/**
 * Brave Web Search Provider — Brave 搜索 Provider 实现
 *
 * 基于 Brave Search API 的隐私保护搜索 Provider。
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
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, CacheEntry>();

function getCacheKey(
  query: string,
  count: number,
  country: string,
  language: string,
  freshness: string,
  safe_search: string,
): string {
  return `${query.toLowerCase()}:${count}:${country}:${language}:${freshness}:${safe_search}`;
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
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, { results, timestamp: Date.now() });
}

// ==================== 凭证辅助 ====================

function getNestedValue(obj: Record<string, unknown> | undefined, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ==================== API 调用 ====================

const DEFAULT_TIMEOUT = 10000;

async function performSearch(
  apiKey: string,
  query: string,
  count: number,
  country?: string,
  language?: string,
  freshness?: string,
  safe_search?: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, country || "", language || "", freshness || "", safe_search || "");
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("count", String(count));

    if (country) {
      params.set("country", country);
    }
    if (language) {
      params.set("search_lang", language);
    }
    if (freshness) {
      params.set("freshness", freshness);
    }
    if (safe_search) {
      params.set("safesearch", safe_search);
    }

    const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Brave 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "brave",
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
      throw new Error("Brave 搜索超时（10秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const web = data.web as Record<string, unknown> | undefined;
  const items = web?.results || data.results || data.data || data.items;
  if (!Array.isArray(items)) {
    return results;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title || "").trim();
    const url = String(item.url || item.link || "").trim();
    const snippet = String(item.description || item.snippet || item.content || "").trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "brave",
  label: "Brave Search",
  hint: "Privacy-focused search API",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"],
  placeholder: "BSA-...",
  signupUrl: "https://brave.com/search/api/",
  docsUrl: "https://api.search.brave.com/app/documentation",
  autoDetectOrder: 20,
  credentialPath: "tools.web.search.providers.brave.apiKey",
  inactiveSecretPaths: [],

  getCredentialValue(searchConfig?: Record<string, unknown>): unknown {
    return getNestedValue(searchConfig, "apiKey");
  },

  setCredentialValue(searchConfigTarget: Record<string, unknown>, value: unknown): void {
    setNestedValue(searchConfigTarget, "apiKey", value);
  },

  getConfiguredCredentialValue(config: Record<string, unknown>): unknown {
    return getNestedValue(config, this.credentialPath);
  },

  setConfiguredCredentialValue(configTarget: Record<string, unknown>, value: unknown): void {
    setNestedValue(configTarget, this.credentialPath, value);
  },

  createTool(ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    let apiKey: string | undefined;

    const configValue = this.getCredentialValue(ctx.searchConfig);
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      apiKey = String(configValue);
    }

    if (!apiKey) {
      for (const envVar of this.envVars) {
        const envValue = process.env[envVar];
        if (envValue && envValue.trim() !== "") {
          apiKey = envValue.trim();
          break;
        }
      }
    }

    if (!apiKey) {
      return null;
    }

    return {
      description: "Search the web using Brave Search, a privacy-focused search engine.",
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
          country: {
            type: "string",
            description: "Country code for localized results (e.g. US, GB, CN)",
          },
          language: {
            type: "string",
            description: "Language code for results (e.g. en, zh)",
          },
          freshness: {
            type: "string",
            description: "Filter results by freshness: pd (past day), pw (past week), pm (past month), py (past year)",
            enum: ["pd", "pw", "pm", "py"],
          },
          safe_search: {
            type: "string",
            description: "Safe search level: off, moderate, strict",
            enum: ["off", "moderate", "strict"],
            default: "moderate",
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

        const count = Math.min(Number(args.count) || 8, 20);
        const country = args.country ? String(args.country) : undefined;
        const language = args.language ? String(args.language) : undefined;
        const freshness = args.freshness ? String(args.freshness) : undefined;
        const safe_search = args.safe_search ? String(args.safe_search) : undefined;

        return performSearch(
          apiKey!,
          query,
          count,
          country,
          language,
          freshness,
          safe_search,
          context?.signal,
        );
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("brave", plugin);

export default plugin;
