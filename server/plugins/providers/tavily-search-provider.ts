/**
 * Tavily Web Search Provider — Tavily 搜索 Provider 实现
 *
 * 基于 Tavily AI-optimized search API 的搜索 Provider。
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
  search_depth: string,
  max_results: number,
  topic: string,
): string {
  return `${query.toLowerCase()}:${search_depth}:${max_results}:${topic}`;
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
  search_depth: string,
  max_results: number,
  include_images: boolean,
  include_answer: boolean,
  include_raw_content: boolean,
  topic: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, search_depth, max_results, topic);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      query,
      search_depth,
      max_results,
      include_images,
      include_answer,
      include_raw_content,
    };
    if (topic && topic !== "general") {
      body.topic = topic;
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Tavily 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "tavily",
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
      throw new Error("Tavily 搜索超时（10秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const items = data.results || data.data || data.items;
  if (!Array.isArray(items)) {
    return results;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title || "").trim();
    const url = String(item.url || item.link || "").trim();
    const snippet = String(item.snippet || item.description || item.content || "").trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "tavily",
  label: "Tavily",
  hint: "AI-optimized search API",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["TAVILY_API_KEY"],
  placeholder: "tvly-...",
  signupUrl: "https://tavily.com/",
  docsUrl: "https://docs.tavily.com/",
  autoDetectOrder: 10,
  credentialPath: "tools.web.search.providers.tavily.apiKey",
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
      description: "Search the web using Tavily, an AI-optimized search API.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          search_depth: {
            type: "string",
            description: "The depth of the search: basic or advanced",
            enum: ["basic", "advanced"],
            default: "basic",
          },
          max_results: {
            type: "number",
            description: "Maximum number of results to return",
            default: 8,
          },
          include_images: {
            type: "boolean",
            description: "Whether to include images in the search results",
            default: false,
          },
          include_answer: {
            type: "boolean",
            description: "Whether to include a direct answer in the response",
            default: false,
          },
          include_raw_content: {
            type: "boolean",
            description: "Whether to include raw content of the pages",
            default: false,
          },
          topic: {
            type: "string",
            description: "The topic category for the search",
            enum: ["general", "news"],
            default: "general",
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

        const search_depth = args.search_depth === "advanced" ? "advanced" : "basic";
        const max_results = Math.min(Number(args.max_results) || 8, 20);
        const include_images = Boolean(args.include_images);
        const include_answer = Boolean(args.include_answer);
        const include_raw_content = Boolean(args.include_raw_content);
        const topic = args.topic === "news" ? "news" : "general";

        return performSearch(
          apiKey!,
          query,
          search_depth,
          max_results,
          include_images,
          include_answer,
          include_raw_content,
          topic,
          context?.signal,
        );
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("tavily", plugin);

export default plugin;
