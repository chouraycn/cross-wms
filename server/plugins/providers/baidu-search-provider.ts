/**
 * Baidu Web Search Provider — 百度搜索 Provider 实现
 *
 * 支持两种模式：
 * 1. 百度搜索开放 API（需要 API Key / Secret Key）
 * 2. HTML 页面解析（免费 fallback，无需凭证）
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

function getCacheKey(query: string, count: number, language?: string): string {
  return `${query.toLowerCase()}:${count}:${language || ""}`;
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
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…");
}

function extractBaiduRedirectUrl(redirectUrl: string): string {
  try {
    const url = new URL(redirectUrl);
    const target = url.searchParams.get("url");
    if (target) {
      return target;
    }
  } catch {
    // ignore
  }
  return redirectUrl;
}

function parseBaiduHtml(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const resultRegex = /<div[^>]*class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  const titleRegex = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>([\s\S]*?)<\/h3>/i;
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRegex = /<span[^>]*class="[^"]*content-right[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
  const altSnippetRegex = /<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    const resultBlock = match[1];

    const titleMatch = resultBlock.match(titleRegex);
    if (!titleMatch) continue;

    const linkMatch = titleMatch[1].match(linkRegex);
    if (!linkMatch) continue;

    let rawUrl = linkMatch[1];
    if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
    if (rawUrl.includes("baidu.com/link?url=")) {
      rawUrl = extractBaiduRedirectUrl(rawUrl);
    }

    const title = decodeHtmlEntities(stripTags(linkMatch[2]).trim());

    let snippet = "";
    const snippetMatch = resultBlock.match(snippetRegex);
    if (snippetMatch) {
      snippet = decodeHtmlEntities(stripTags(snippetMatch[1]).trim());
    } else {
      const altSnippetMatch = resultBlock.match(altSnippetRegex);
      if (altSnippetMatch) {
        snippet = decodeHtmlEntities(stripTags(altSnippetMatch[1]).trim());
      }
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({ title, url: rawUrl, snippet });
    }
  }

  if (results.length === 0) {
    const fallbackRegex = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;
    let fallbackMatch;
    while ((fallbackMatch = fallbackRegex.exec(html)) !== null && results.length < maxResults) {
      const h3Content = fallbackMatch[1];
      const linkMatch = h3Content.match(linkRegex);
      if (!linkMatch) continue;

      let rawUrl = linkMatch[1];
      if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
      if (rawUrl.includes("baidu.com/link?url=")) {
        rawUrl = extractBaiduRedirectUrl(rawUrl);
      }

      const title = decodeHtmlEntities(stripTags(linkMatch[2]).trim());

      if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
        results.push({ title, url: rawUrl, snippet: "" });
      }
    }
  }

  return results;
}

// ==================== API 模式 ====================

const DEFAULT_TIMEOUT = 8000;

async function performApiSearch(
  apiKey: string,
  secretKey: string,
  query: string,
  count: number,
  language?: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, language);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!tokenResponse.ok) {
      throw new Error(`百度 API Token 获取失败: HTTP ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
    const accessToken = String(tokenData.access_token || "");

    if (!accessToken) {
      throw new Error("百度 API Token 获取失败: 未返回 access_token");
    }

    const searchUrl = `https://aip.baidubce.com/rest/2.0/brain/online/llm/web_search?access_token=${accessToken}`;

    const searchBody: Record<string, unknown> = {
      query,
      count: Math.min(count, 20),
    };

    if (language) {
      searchBody.language = language;
    }

    const searchResponse = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text().catch(() => "");
      throw new Error(`百度搜索 API 请求失败: HTTP ${searchResponse.status} ${errorText}`);
    }

    const data = (await searchResponse.json()) as Record<string, unknown>;
    const results = normalizeApiResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "baidu",
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
      throw new Error("百度搜索超时（8秒）");
    }
    throw e;
  }
}

function normalizeApiResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const items = data.results || data.data || data.items;
  if (!Array.isArray(items)) {
    return results;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title || "").trim();
    const url = String(item.url || item.link || "").trim();
    const snippet = String(item.snippet || item.description || item.content || item.summary || "").trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== HTML 模式（Fallback） ====================

async function performHtmlSearch(
  query: string,
  count: number,
  language?: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, language);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const encodedQuery = encodeURIComponent(query);
  let url = `https://www.baidu.com/s?wd=${encodedQuery}&rn=${Math.min(count * 2, 50)}`;

  if (language) {
    if (language === "zh" || language === "zh-CN") {
      url += "&ct=2097152";
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      throw new Error(`百度搜索请求失败: HTTP ${response.status}`);
    }

    const html = await response.text();
    const results = parseBaiduHtml(html, count);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "baidu",
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
      throw new Error("百度搜索超时（8秒）");
    }
    throw e;
  }
}

// ==================== 统一搜索入口 ====================

async function performSearch(
  apiKey: string | undefined,
  secretKey: string | undefined,
  query: string,
  count: number,
  language?: string,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  if (apiKey && secretKey) {
    try {
      return await performApiSearch(apiKey, secretKey, query, count, language, signal);
    } catch {
      // API 模式失败，回退到 HTML 解析模式
    }
  }

  return performHtmlSearch(query, count, language, signal);
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "baidu",
  label: "百度",
  hint: "百度搜索",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["BAIDU_API_KEY", "BAIDU_SECRET_KEY"],
  placeholder: "输入百度 API Key（可选，留空使用 HTML 解析模式）",
  signupUrl: "https://cloud.baidu.com/",
  docsUrl: "https://cloud.baidu.com/doc/index.html",
  autoDetectOrder: 38,
  credentialPath: "tools.web.search.providers.baidu.apiKey",
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
    let secretKey: string | undefined;

    const configValue = this.getCredentialValue(ctx.searchConfig);
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      apiKey = String(configValue);
    }

    if (!apiKey) {
      for (const envVar of this.envVars) {
        const envValue = process.env[envVar];
        if (envValue && envValue.trim() !== "") {
          if (envVar === "BAIDU_API_KEY") {
            apiKey = envValue.trim();
          } else if (envVar === "BAIDU_SECRET_KEY") {
            secretKey = envValue.trim();
          }
          if (apiKey && secretKey) break;
        }
      }
    }

    if (!secretKey) {
      const secretEnvValue = process.env["BAIDU_SECRET_KEY"];
      if (secretEnvValue && secretEnvValue.trim() !== "") {
        secretKey = secretEnvValue.trim();
      }
    }

    return {
      description: "使用百度搜索网页，支持 API 模式和 HTML 解析两种方式。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
          count: {
            type: "number",
            description: "返回结果的最大数量（最多 20 条）",
            default: 8,
          },
          language: {
            type: "string",
            description: "语言代码（例如 zh, en）",
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
        const language = args.language ? String(args.language) : undefined;

        return performSearch(apiKey, secretKey, query, count, language, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("baidu", plugin);

export default plugin;
