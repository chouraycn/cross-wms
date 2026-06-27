/**
 * Perplexity Web Search Provider — Perplexity 搜索 Provider 实现
 *
 * 基于 Perplexity LLM-powered search API 的搜索 Provider。
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
  max_tokens: number,
  search_domain_filter: string,
  return_images: boolean,
  return_links: boolean,
): string {
  return `${query.toLowerCase()}:${max_tokens}:${search_domain_filter}:${return_images}:${return_links}`;
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
  max_tokens: number,
  search_domain_filter: string[],
  return_images: boolean,
  return_links: boolean,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const domainFilterKey = search_domain_filter.join(",");
  const cacheKey = getCacheKey(query, max_tokens, domainFilterKey, return_images, return_links);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: "Be precise and concise." },
      { role: "user", content: query },
    ];

    const body: Record<string, unknown> = {
      model: "sonar",
      messages,
      max_tokens,
      return_images,
      return_links,
    };

    if (search_domain_filter.length > 0) {
      body.search_domain_filter = search_domain_filter;
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Perplexity 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "perplexity",
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
      throw new Error("Perplexity 搜索超时（10秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const citations = message?.citations;
    if (Array.isArray(citations)) {
      for (const item of citations) {
        if (!item || typeof item !== "object") continue;

        const title = String(item.title || item.url || "").trim();
        const url = String(item.url || item.link || "").trim();
        const snippet = String(item.snippet || item.description || "").trim();

        if (url) {
          results.push({ title, url, snippet });
        }
      }
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "perplexity",
  label: "Perplexity",
  hint: "LLM-powered search with citations",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["PERPLEXITY_API_KEY"],
  placeholder: "pplx-...",
  signupUrl: "https://www.perplexity.ai/",
  docsUrl: "https://docs.perplexity.ai/",
  autoDetectOrder: 15,
  credentialPath: "tools.web.search.providers.perplexity.apiKey",
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
      description: "Search the web using Perplexity, an LLM-powered search engine with citations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          max_tokens: {
            type: "number",
            description: "Maximum number of tokens in the response",
            default: 1024,
          },
          search_domain_filter: {
            type: "array",
            description: "List of domains to filter search results",
            items: {
              type: "string",
            },
            default: [],
          },
          return_images: {
            type: "boolean",
            description: "Whether to return images in search results",
            default: false,
          },
          return_links: {
            type: "boolean",
            description: "Whether to return links in search results",
            default: true,
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

        const max_tokens = Math.min(Number(args.max_tokens) || 1024, 4096);
        const search_domain_filter = Array.isArray(args.search_domain_filter)
          ? args.search_domain_filter.filter((d): d is string => typeof d === "string")
          : [];
        const return_images = Boolean(args.return_images);
        const return_links = args.return_links !== undefined ? Boolean(args.return_links) : true;

        return performSearch(
          apiKey!,
          query,
          max_tokens,
          search_domain_filter,
          return_images,
          return_links,
          context?.signal,
        );
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("perplexity", plugin);

export default plugin;
