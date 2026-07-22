/**
 * DuckDuckGo Web Search Provider — DuckDuckGo 搜索 Provider 实现
 *
 * 基于 DuckDuckGo HTML 端点（html.duckduckgo.com/html）的搜索 Provider。
 * 不需要 API Key，通过 HTML 解析返回标准化搜索结果。
 *
 * 参考实现：
 *   - brave-search-provider.ts 的 Provider 结构
 *   - openclaw/extensions/duckduckgo/src/ddg-client.ts 的 HTML 解析逻辑
 */

import type {
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderContext,
  WebSearchResultList,
  WebSearchResult,
} from "../web-provider-types.js";
import { registerWebSearchProvider } from "../web-search-providers.js";

// ==================== 类型 ====================

type DdgSafeSearch = "strict" | "moderate" | "off";

interface DuckDuckGoResult {
  title: string;
  url: string;
  snippet: string;
}

// ==================== 缓存 ====================

interface CacheEntry {
  results: WebSearchResultList;
  timestamp: number;
}

const CACHE_TTL = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, CacheEntry>();

function getCacheKey(
  query: string,
  count: number,
  region: string,
  safeSearch: string,
): string {
  return `${query.toLowerCase()}:${count}:${region}:${safeSearch}`;
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
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ==================== HTML 解析辅助 ====================

const DDG_HTML_ENDPOINT = "https://html.duckduckgo.com/html";
const DEFAULT_TIMEOUT = 12000;
const DDG_SAFE_SEARCH_PARAM: Record<DdgSafeSearch, string> = {
  strict: "1",
  moderate: "-1",
  off: "-2",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "--")
    .replace(/&hellip;/g, "...")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckDuckGoUrl(rawUrl: string): string {
  try {
    const normalized = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const parsed = new URL(normalized);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      return uddg;
    }
  } catch {
    // DuckDuckGo 已返回直链时保留原值
  }
  return rawUrl;
}

function readHrefAttribute(tagAttributes: string): string {
  return /\bhref="([^"]*)"/i.exec(tagAttributes)?.[1] ?? "";
}

function isBotChallenge(html: string): boolean {
  if (/class="[^"]*\bresult__a\b[^"]*"/i.test(html)) {
    return false;
  }
  return /g-recaptcha|are you a human|id="challenge-form"|name="challenge"/i.test(html);
}

function parseDuckDuckGoHtml(html: string): DuckDuckGoResult[] {
  const results: DuckDuckGoResult[] = [];
  const resultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")([^>]*)>([\s\S]*?)<\/a>/gi;
  const nextResultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")[^>]*>/i;
  const snippetRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*")[^>]*>([\s\S]*?)<\/a>/i;

  for (const match of html.matchAll(resultRegex)) {
    const rawAttributes = match[1] ?? "";
    const rawTitle = match[2] ?? "";
    const rawUrl = readHrefAttribute(rawAttributes);
    const matchEnd = (match.index ?? 0) + match[0].length;
    const trailingHtml = html.slice(matchEnd);
    const nextResultIndex = trailingHtml.search(nextResultRegex);
    const scopedTrailingHtml =
      nextResultIndex >= 0 ? trailingHtml.slice(0, nextResultIndex) : trailingHtml;
    const rawSnippet = snippetRegex.exec(scopedTrailingHtml)?.[1] ?? "";
    const title = decodeHtmlEntities(stripHtml(rawTitle));
    const url = decodeDuckDuckGoUrl(decodeHtmlEntities(rawUrl));
    const snippet = decodeHtmlEntities(stripHtml(rawSnippet));

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== 搜索执行 ====================

function resolveSiteName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function performSearch(
  query: string,
  count: number,
  region: string,
  safeSearch: DdgSafeSearch,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, region, safeSearch);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const url = new URL(DDG_HTML_ENDPOINT);
    url.searchParams.set("q", query);
    if (region) {
      url.searchParams.set("kl", region);
    }
    url.searchParams.set("kp", DDG_SAFE_SEARCH_PARAM[safeSearch]);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `DuckDuckGo 搜索请求失败: HTTP ${response.status} ${errorText.slice(0, 500)}`,
      );
    }

    const html = await response.text();
    if (isBotChallenge(html)) {
      throw new Error("DuckDuckGo 返回了 bot 检测挑战页面，无法解析结果");
    }

    const ddgResults = parseDuckDuckGoHtml(html).slice(0, count);
    const results: WebSearchResult[] = ddgResults.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    }));

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
      throw new Error("DuckDuckGo 搜索超时（12秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "duckduckgo",
  label: "DuckDuckGo Search",
  hint: "DuckDuckGo 搜索 — 无需 API Key，通过 HTML 解析返回结果",
  requiresCredential: false,
  envVars: [],
  placeholder: "(无需 API Key)",
  signupUrl: "https://duckduckgo.com/",
  docsUrl: "https://duckduckgo.com/duckduckgo-help-pages/results/",
  autoDetectOrder: 6,
  credentialPath: "tools.web.search.providers.duckduckgo.apiKey",
  inactiveSecretPaths: [],

  getCredentialValue(_searchConfig?: Record<string, unknown>): unknown {
    // DuckDuckGo 不需要凭证
    return undefined;
  },

  setCredentialValue(_searchConfigTarget: Record<string, unknown>, _value: unknown): void {
    // DuckDuckGo 不需要凭证，空操作
  },

  getConfiguredCredentialValue(_config: Record<string, unknown>): unknown {
    return undefined;
  },

  setConfiguredCredentialValue(_configTarget: Record<string, unknown>, _value: unknown): void {
    // DuckDuckGo 不需要凭证，空操作
  },

  createTool(_ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    // DuckDuckGo 不需要凭证，总是返回可用工具
    return {
      description:
        "Search the web using DuckDuckGo. Returns titles, URLs, and snippets with no API key required.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query string.",
          },
          count: {
            type: "integer",
            description: "Number of results to return (1-10).",
            minimum: 1,
            maximum: 10,
            default: 10,
          },
          region: {
            type: "string",
            description:
              "Optional DuckDuckGo region code such as us-en, uk-en, cn-zh, or de-de.",
          },
          safeSearch: {
            type: "string",
            enum: ["strict", "moderate", "off"],
            description: "SafeSearch level. Default: moderate.",
            default: "moderate",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      async execute(
        args: Record<string, unknown>,
        context?: { signal?: AbortSignal },
      ): Promise<WebSearchResultList> {
        const query = String(args.query || "").trim();
        if (!query) {
          throw new Error("搜索关键词不能为空");
        }

        const count = Math.min(Math.max(Number(args.count || 10), 1), 10);
        const region = args.region ? String(args.region).trim() : "";
        const safeSearch: DdgSafeSearch =
          args.safeSearch === "strict" || args.safeSearch === "off"
            ? args.safeSearch
            : "moderate";

        return performSearch(query, count, region, safeSearch, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("duckduckgo", plugin);

export default plugin;

// 导出测试辅助函数
export const __testing = {
  decodeHtmlEntities,
  stripHtml,
  decodeDuckDuckGoUrl,
  readHrefAttribute,
  isBotChallenge,
  parseDuckDuckGoHtml,
  resolveSiteName,
};
