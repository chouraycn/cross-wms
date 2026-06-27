/**
 * Ollama Web Search Provider — Ollama 本地搜索 Provider 实现
 *
 * 基于本地 Ollama 模型的搜索 Provider，通过 Ollama API 进行搜索。
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

function getCacheKey(query: string, count: number, model: string): string {
  return `${query.toLowerCase()}:${count}:${model}`;
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

const DEFAULT_BASE_URL = "http://localhost:11434";

function getBaseUrl(searchConfig?: Record<string, unknown>): string {
  if (searchConfig) {
    const configValue = searchConfig.baseUrl;
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      return String(configValue).replace(/\/$/, "");
    }
  }
  const envValue = process.env.OLLAMA_BASE_URL;
  if (envValue && envValue !== "") {
    return envValue.replace(/\/$/, "");
  }
  return DEFAULT_BASE_URL;
}

// ==================== 搜索执行 ====================

interface OllamaSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
  text?: string;
}

interface OllamaSearchResponse {
  results?: OllamaSearchResult[];
  model?: string;
}

async function performSearch(
  query: string,
  count: number,
  model: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, model);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        query,
        count,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      throw new Error(`Ollama 搜索请求失败: HTTP ${response.status}`);
    }

    const data = (await response.json()) as OllamaSearchResponse;
    const rawResults = data.results || [];

    const results: WebSearchResult[] = [];
    for (const raw of rawResults) {
      if (results.length >= count) break;
      const title = raw.title || raw.url || "Untitled";
      const url = raw.url || "";
      const snippet = raw.snippet || raw.content || raw.text || "";
      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "ollama",
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
      throw new Error("Ollama 搜索超时（10秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "ollama",
  label: "Ollama",
  hint: "Local Ollama model with search",
  requiresCredential: false,
  envVars: ["OLLAMA_BASE_URL"],
  placeholder: "http://localhost:11434",
  signupUrl: "https://ollama.com/",
  docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
  autoDetectOrder: 60,
  credentialPath: "tools.web.search.providers.ollama.baseUrl",
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

    return {
      description: "Search the web using a local Ollama model with search capabilities.",
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
          model: {
            type: "string",
            description: "Ollama model name to use for search (e.g. llama3.2, qwen2.5)",
            default: "llama3.2",
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
        const model = String(args.model || "llama3.2");

        return performSearch(query, count, model, baseUrl, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("ollama", plugin);

export default plugin;
