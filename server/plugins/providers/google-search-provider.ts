/**
 * Google Web Search Provider — Google (Gemini) 搜索 Provider 实现
 *
 * 基于 Google Gemini API groundSearch 工具的搜索 Provider。
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

function getCacheKey(query: string, count: number): string {
  return `${query.toLowerCase()}:${count}`;
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
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body = {
      contents: [
        {
          parts: [
            {
              text: query,
            },
          ],
        },
      ],
      tools: [
        {
          googleSearch: {},
        },
      ],
    };

    const response = await fetch(url, {
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
      throw new Error(`Google 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (data.error && typeof data.error === "object") {
      const err = data.error as Record<string, unknown>;
      throw new Error(`API 错误: ${err.message || "Unknown error"}`);
    }

    const results = normalizeResults(data).slice(0, count);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "google",
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
      throw new Error("Google 搜索超时（10秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const candidates = data.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const candidate = candidates[0] as Record<string, unknown>;
    const groundingMetadata = candidate.groundingMetadata as Record<string, unknown> | undefined;
    const groundingSources = groundingMetadata?.groundingSources;
    if (Array.isArray(groundingSources)) {
      for (const item of groundingSources) {
        if (!item || typeof item !== "object") continue;

        const title = String(item.title || item.uri || "").trim();
        const url = String(item.uri || item.url || item.link || "").trim();
        const snippet = String(item.snippet || item.description || item.content || "").trim();

        if (title && url) {
          results.push({ title, url, snippet });
        }
      }
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "google",
  label: "Google",
  hint: "Google Search via Gemini API",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  placeholder: "AIzaSy...",
  signupUrl: "https://ai.google.dev/",
  docsUrl: "https://ai.google.dev/gemini-api/docs",
  autoDetectOrder: 25,
  credentialPath: "tools.web.search.providers.google.apiKey",
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
      description: "Search the web using Google Search via the Gemini API.",
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

        return performSearch(apiKey!, query, count, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("google", plugin);

export default plugin;
