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
import * as cheerio from "cheerio";

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
  const $ = cheerio.load(html);

  $(".result").each((_, elem) => {
    if (results.length >= maxResults) return;

    const $elem = $(elem);
    const $h3 = $elem.find("h3");
    if ($h3.length === 0) return;

    const $link = $h3.find("a");
    if ($link.length === 0) return;

    let rawUrl = $link.attr("href") || "";
    if (!rawUrl) return;

    if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
    if (rawUrl.includes("baidu.com/link?url=") || rawUrl.includes("baidu.com/link?wd=")) {
      rawUrl = extractBaiduRedirectUrl(rawUrl);
    }

    const title = decodeHtmlEntities(stripTags($link.text()).trim());

    let snippet = "";
    const snippetSelectors = [
      ".c-abstract",
      ".content-right",
      ".c-span-last",
      ".abstract",
      ".c-gap-top-small",
      "div[class*='abstract']",
      "div[class*='content']",
    ];

    for (const sel of snippetSelectors) {
      const $snippet = $elem.find(sel);
      if ($snippet.length > 0) {
        const text = decodeHtmlEntities(stripTags($snippet.text()).trim());
        if (text.length > 10) {
          snippet = text;
          break;
        }
      }
    }

    if (snippet.length < 10) {
      const $divs = $elem.find("div");
      let bestText = "";
      $divs.each((_, div) => {
        const text = decodeHtmlEntities(stripTags($(div).text()).trim());
        if (text.length > bestText.length && text.length < 300) {
          bestText = text;
        }
      });
      if (bestText.length > 10) {
        snippet = bestText;
      }
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({ title, url: rawUrl, snippet });
    }
  });

  if (results.length === 0) {
    $("h3").each((_, elem) => {
      if (results.length >= maxResults) return;
      const $h3 = $(elem);
      const $link = $h3.find("a");
      if ($link.length === 0) return;

      let rawUrl = $link.attr("href") || "";
      if (!rawUrl) return;

      if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
      if (rawUrl.includes("baidu.com/link?url=") || rawUrl.includes("baidu.com/link?wd=")) {
        rawUrl = extractBaiduRedirectUrl(rawUrl);
      }

      const title = decodeHtmlEntities(stripTags($link.text()).trim());

      if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
        results.push({ title, url: rawUrl, snippet: "" });
      }
    });
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

function detectJsRedirect(html: string, currentUrl: string): string | null {
  if (
    html.includes('location.href.replace("https://","http://")') ||
    html.includes("location.href.replace('https://','http://')")
  ) {
    return currentUrl.replace("https://", "http://");
  }
  if (
    html.includes('location.href.replace("http://","https://")') ||
    html.includes("location.href.replace('http://','https://')")
  ) {
    return currentUrl.replace("http://", "https://");
  }

  const locationReplaceMatch = html.match(/location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i);
  if (locationReplaceMatch) {
    return locationReplaceMatch[1];
  }
  
  const metaMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
  if (metaMatch) {
    return metaMatch[1];
  }
  
  return null;
}

function isCaptchaPage(html: string, url: string): boolean {
  if (url.includes("wappass.baidu.com") || url.includes("passport.baidu.com")) {
    return true;
  }
  if (html.includes("验证") && html.includes("captcha")) {
    return true;
  }
  if (html.includes('id="captcha"') || html.includes('class="captcha"')) {
    return true;
  }
  return false;
}

async function fetchBaiduHtml(
  url: string,
  signal?: AbortSignal,
  maxRedirects: number = 3,
): Promise<{ html: string; finalUrl: string }> {
  if (maxRedirects <= 0) {
    throw new Error("百度搜索重定向次数过多");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`百度搜索请求失败: HTTP ${response.status}`);
  }

  const html = await response.text();
  
  if (isCaptchaPage(html, response.url)) {
    throw new Error("百度搜索触发验证码验证，无法获取结果");
  }
  
  const redirectUrl = detectJsRedirect(html, url);
  if (redirectUrl) {
    let finalRedirectUrl = redirectUrl;
    if (finalRedirectUrl.startsWith("/")) {
      const parsed = new URL(url);
      finalRedirectUrl = `${parsed.protocol}//${parsed.host}${finalRedirectUrl}`;
    }
    return fetchBaiduHtml(finalRedirectUrl, signal, maxRedirects - 1);
  }

  return { html, finalUrl: response.url };
}

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
    const { html } = await fetchBaiduHtml(url, controller.signal);
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
  autoDetectOrder: 1,
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
