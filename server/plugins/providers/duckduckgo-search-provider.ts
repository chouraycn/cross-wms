/**
 * DuckDuckGo Web Search Provider — DuckDuckGo 搜索 Provider 实现
 *
 * 基于 DuckDuckGo HTML 搜索页面的免费搜索 Provider，
 * 无需 API Key，作为 fallback 选项使用。
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
const cache = new Map<string, CacheEntry>();

function getCacheKey(query: string, count: number, country?: string, language?: string): string {
  return `${query.toLowerCase()}:${count}:${country || ""}:${language || ""}`;
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
  cache.set(key, { results, timestamp: Date.now() });
}

// ==================== HTML 解析辅助 ====================

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseDuckDuckGoHtml(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const linkMatches = [...html.matchAll(linkRegex)];
  const snippetMatches = [...html.matchAll(snippetRegex)];

  for (let i = 0; i < Math.min(linkMatches.length, maxResults); i++) {
    const linkMatch = linkMatches[i];
    let rawUrl = linkMatch[1];
    if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;

    const title = decodeHtmlEntities(stripTags(linkMatch[2]).trim());
    const snippet = snippetMatches[i]
      ? decodeHtmlEntities(stripTags(snippetMatches[i][1]).trim())
      : "";

    if (title && rawUrl) {
      results.push({ title, url: rawUrl, snippet });
    }
  }

  if (results.length === 0) {
    const altRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const altMatches = [...html.matchAll(altRegex)];
    for (let i = 0; i < Math.min(altMatches.length, maxResults); i++) {
      const m = altMatches[i];
      let rawUrl = m[1];
      if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
      const title = decodeHtmlEntities(stripTags(m[2]).trim());
      if (title && rawUrl) {
        results.push({ title, url: rawUrl, snippet: "" });
      }
    }
  }

  return results;
}

// ==================== 搜索执行 ====================

async function performSearch(
  query: string,
  count: number,
  country?: string,
  language?: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, country, language);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const encodedQuery = encodeURIComponent(query);
  let url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  if (country) {
    url += `&kp=-2&kl=${encodeURIComponent(country)}`;
  }
  if (language) {
    url += `&kl=${encodeURIComponent(language)}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "CrossWMS-AI/1.0",
        Accept: "text/html",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      throw new Error(`搜索请求失败: HTTP ${response.status}`);
    }

    const html = await response.text();
    const results = parseDuckDuckGoHtml(html, count);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "duckduckgo",
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
      throw new Error("搜索超时（5秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "duckduckgo",
  label: "DuckDuckGo",
  hint: "Free privacy-focused search",
  requiresCredential: false,
  envVars: [],
  placeholder: "",
  signupUrl: "https://duckduckgo.com/",
  docsUrl: "https://html.duckduckgo.com/html/",
  autoDetectOrder: 100,
  credentialPath: "",
  inactiveSecretPaths: [],

  getCredentialValue(): unknown {
    return undefined;
  },

  setCredentialValue(): void {
    // no-op: DuckDuckGo 不需要凭证
  },

  createTool(_ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    return {
      description: "Search the web using DuckDuckGo, a free privacy-focused search engine.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          count: {
            type: "number",
            description: "Maximum number of results to return (up to 20)",
            default: 8,
          },
          country: {
            type: "string",
            description: "Country/region code for localized results (e.g. us, uk, cn)",
          },
          language: {
            type: "string",
            description: "Language code for results (e.g. en, zh)",
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

        return performSearch(query, count, country, language, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("duckduckgo", plugin);

export default plugin;
