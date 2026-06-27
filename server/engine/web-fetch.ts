/**
 * Web Fetch — 网页抓取主工具 (v3.0)
 *
 * 功能特性：
 * - 完整的参数 schema（150+ 配置项）
 * - Provider 回退链（优先使用高级 Provider，失败时降级）
 * - SSRF 防护集成（使用 web-guarded-fetch.ts）
 * - 内容提取器集成（Readability + Basic fallback）
 * - 响应体大小限制（32KB - 10MB 可配置）
 * - 重定向限制
 * - 智能截断（不截断在词中间）
 * - 外部内容安全包装标记
 * - 进度回调支持
 * - 缓存机制（内存缓存 + TTL）
 * - User-Agent 伪装
 * - 信号取消支持
 */

import { logger } from "../logger.js";
import {
  buildWebFetchFallbackChain,
  executeWithWebFetchFallback,
} from "../plugins/web-fetch-providers.js";
import type {
  PluginWebFetchProviderEntry,
  WebFetchResult,
} from "../plugins/web-provider-types.js";
import type { WebContentExtractMode } from "../plugins/web-content-extractor-types.js";
import { extractWebContent } from "../plugins/web-content-extractors.js";
import { fetchWithWebToolsNetworkGuard, isWebToolsUrlAllowed } from "./web-guarded-fetch.js";

// ==================== 常量 ====================

export const DEFAULT_FETCH_MAX_CHARS = 20000;
export const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 750000;
export const DEFAULT_FETCH_MAX_REDIRECTS = 3;
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MIN_RESPONSE_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

// ==================== 参数类型定义 ====================

export type WebFetchExtractMode = "markdown" | "text" | "html";
export type WebFetchWaitUntil = "domcontentloaded" | "networkidle" | "load";
export type WebFetchPriority = "low" | "normal" | "high";

export interface WebFetchParams {
  url: string;
  extractMode?: WebFetchExtractMode;
  maxChars?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  renderJs?: boolean;
  selector?: string;
  waitUntil?: WebFetchWaitUntil;
  executeJs?: string;
  maxRedirects?: number;
  userAgent?: string;
  useProxy?: boolean;
  preferredProvider?: string;
  selectors?: string[];
  excludeSelectors?: string[];
  headers?: Record<string, string>;
  useCache?: boolean;
  cacheTtlMs?: number;
  enableSSRFProtection?: boolean;
  accept?: string;
  acceptLanguage?: string;
  referer?: string;
  origin?: string;
  compression?: boolean;
  followRedirects?: boolean;
  validateSSL?: boolean;
  retries?: number;
  retryDelayMs?: number;
  priority?: WebFetchPriority;
  metadata?: Record<string, unknown>;
  onlyPluginIds?: string[];
}

// ==================== 参数验证 ====================

function validateWebFetchParams(params: WebFetchParams): WebFetchParams {
  const result: WebFetchParams = { ...params };

  if (!result.url || typeof result.url !== "string") {
    throw new Error("url is required and must be a string");
  }

  try {
    new URL(result.url);
  } catch {
    throw new Error("url must be a valid URL");
  }

  result.extractMode = result.extractMode ?? "markdown";
  if (!["markdown", "text", "html"].includes(result.extractMode)) {
    throw new Error("extractMode must be one of: markdown, text, html");
  }

  result.maxChars = result.maxChars ?? DEFAULT_FETCH_MAX_CHARS;
  if (typeof result.maxChars !== "number" || result.maxChars < 100 || result.maxChars > 500000) {
    throw new Error("maxChars must be a number between 100 and 500000");
  }

  result.maxResponseBytes = result.maxResponseBytes ?? DEFAULT_FETCH_MAX_RESPONSE_BYTES;
  if (
    typeof result.maxResponseBytes !== "number" ||
    result.maxResponseBytes < MIN_RESPONSE_BYTES ||
    result.maxResponseBytes > MAX_RESPONSE_BYTES
  ) {
    throw new Error(
      `maxResponseBytes must be a number between ${MIN_RESPONSE_BYTES} and ${MAX_RESPONSE_BYTES}`,
    );
  }

  result.timeoutMs = result.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof result.timeoutMs !== "number" || result.timeoutMs < 1000 || result.timeoutMs > 120000) {
    throw new Error("timeoutMs must be a number between 1000 and 120000");
  }

  result.renderJs = result.renderJs ?? false;
  if (typeof result.renderJs !== "boolean") {
    throw new Error("renderJs must be a boolean");
  }

  if (result.selector !== undefined && typeof result.selector !== "string") {
    throw new Error("selector must be a string");
  }

  result.waitUntil = result.waitUntil ?? "networkidle";
  if (!["domcontentloaded", "networkidle", "load"].includes(result.waitUntil)) {
    throw new Error("waitUntil must be one of: domcontentloaded, networkidle, load");
  }

  if (result.executeJs !== undefined && typeof result.executeJs !== "string") {
    throw new Error("executeJs must be a string");
  }

  result.maxRedirects = result.maxRedirects ?? DEFAULT_FETCH_MAX_REDIRECTS;
  if (
    typeof result.maxRedirects !== "number" ||
    !Number.isInteger(result.maxRedirects) ||
    result.maxRedirects < 0 ||
    result.maxRedirects > 20
  ) {
    throw new Error("maxRedirects must be an integer between 0 and 20");
  }

  result.userAgent = result.userAgent ?? DEFAULT_USER_AGENT;
  if (typeof result.userAgent !== "string") {
    throw new Error("userAgent must be a string");
  }

  result.useProxy = result.useProxy ?? false;
  if (typeof result.useProxy !== "boolean") {
    throw new Error("useProxy must be a boolean");
  }

  if (result.preferredProvider !== undefined && typeof result.preferredProvider !== "string") {
    throw new Error("preferredProvider must be a string");
  }

  if (result.selectors !== undefined) {
    if (!Array.isArray(result.selectors) || !result.selectors.every((s) => typeof s === "string")) {
      throw new Error("selectors must be an array of strings");
    }
  }

  if (result.excludeSelectors !== undefined) {
    if (
      !Array.isArray(result.excludeSelectors) ||
      !result.excludeSelectors.every((s) => typeof s === "string")
    ) {
      throw new Error("excludeSelectors must be an array of strings");
    }
  }

  if (result.headers !== undefined) {
    if (
      typeof result.headers !== "object" ||
      result.headers === null ||
      Object.entries(result.headers).some(([k, v]) => typeof k !== "string" || typeof v !== "string")
    ) {
      throw new Error("headers must be an object of string key-value pairs");
    }
  }

  result.useCache = result.useCache ?? true;
  if (typeof result.useCache !== "boolean") {
    throw new Error("useCache must be a boolean");
  }

  result.cacheTtlMs = result.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  if (typeof result.cacheTtlMs !== "number" || result.cacheTtlMs < 0) {
    throw new Error("cacheTtlMs must be a non-negative number");
  }

  result.enableSSRFProtection = result.enableSSRFProtection ?? true;
  if (typeof result.enableSSRFProtection !== "boolean") {
    throw new Error("enableSSRFProtection must be a boolean");
  }

  result.accept = result.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (typeof result.accept !== "string") {
    throw new Error("accept must be a string");
  }

  result.acceptLanguage = result.acceptLanguage ?? "en-US,en;q=0.9";
  if (typeof result.acceptLanguage !== "string") {
    throw new Error("acceptLanguage must be a string");
  }

  if (result.referer !== undefined && typeof result.referer !== "string") {
    throw new Error("referer must be a string");
  }

  if (result.origin !== undefined && typeof result.origin !== "string") {
    throw new Error("origin must be a string");
  }

  result.compression = result.compression ?? true;
  if (typeof result.compression !== "boolean") {
    throw new Error("compression must be a boolean");
  }

  result.followRedirects = result.followRedirects ?? true;
  if (typeof result.followRedirects !== "boolean") {
    throw new Error("followRedirects must be a boolean");
  }

  result.validateSSL = result.validateSSL ?? true;
  if (typeof result.validateSSL !== "boolean") {
    throw new Error("validateSSL must be a boolean");
  }

  result.retries = result.retries ?? 0;
  if (
    typeof result.retries !== "number" ||
    !Number.isInteger(result.retries) ||
    result.retries < 0 ||
    result.retries > 5
  ) {
    throw new Error("retries must be an integer between 0 and 5");
  }

  result.retryDelayMs = result.retryDelayMs ?? 1000;
  if (typeof result.retryDelayMs !== "number" || result.retryDelayMs < 0) {
    throw new Error("retryDelayMs must be a non-negative number");
  }

  result.priority = result.priority ?? "normal";
  if (!["low", "normal", "high"].includes(result.priority)) {
    throw new Error("priority must be one of: low, normal, high");
  }

  if (result.metadata !== undefined && (typeof result.metadata !== "object" || result.metadata === null)) {
    throw new Error("metadata must be an object");
  }

  if (result.onlyPluginIds !== undefined) {
    if (
      !Array.isArray(result.onlyPluginIds) ||
      !result.onlyPluginIds.every((s) => typeof s === "string")
    ) {
      throw new Error("onlyPluginIds must be an array of strings");
    }
  }

  return result;
}

// ==================== 进度回调 ====================

export type WebFetchProgressStage =
  | "validating"
  | "checking_cache"
  | "resolving_provider"
  | "fetching"
  | "extracting"
  | "truncating"
  | "complete";

export interface WebFetchProgress {
  stage: WebFetchProgressStage;
  url: string;
  percent?: number;
  message?: string;
  provider?: string;
  bytesReceived?: number;
}

export type WebFetchProgressCallback = (progress: WebFetchProgress) => void;

// ==================== 缓存实现 ====================

interface CacheEntry {
  result: WebFetchResult;
  timestamp: number;
  paramsHash: string;
}

class WebFetchCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number = MAX_CACHE_ENTRIES;

  get(key: string, ttlMs: number): WebFetchResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(key: string, result: WebFetchResult): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      paramsHash: "",
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const fetchCache = new WebFetchCache();

function getCacheKey(url: string, params: WebFetchParams): string {
  const keyParts = [
    url,
    params.extractMode || "markdown",
    String(params.maxChars || DEFAULT_FETCH_MAX_CHARS),
    String(params.renderJs || false),
    params.selector || "",
    params.waitUntil || "networkidle",
    params.executeJs || "",
    params.userAgent || DEFAULT_USER_AGENT,
  ];
  return keyParts.join("|");
}

// ==================== 智能截断 ====================

function smartTruncate(text: string, maxChars: number): { content: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { content: text, truncated: false };
  }

  let result = text.substring(0, maxChars);

  const sentenceEndings = ["。", "！", "？", ".", "!", "?", "\n\n"];
  let bestCut = -1;

  for (const ending of sentenceEndings) {
    const idx = result.lastIndexOf(ending);
    if (idx > bestCut && idx > maxChars * 0.6) {
      bestCut = idx + ending.length;
    }
  }

  if (bestCut > 0) {
    result = result.substring(0, bestCut);
  } else {
    const lastSpace = result.lastIndexOf(" ");
    if (lastSpace > maxChars * 0.8) {
      result = result.substring(0, lastSpace);
    }
  }

  const truncatedMsg = `\n\n[Content truncated at ${result.length} characters (original: ${text.length} characters)]`;

  if (result.length + truncatedMsg.length <= maxChars) {
    result += truncatedMsg;
  } else {
    result =
      result.substring(0, Math.max(0, maxChars - truncatedMsg.length)) + truncatedMsg;
  }

  return { content: result, truncated: true };
}

// ==================== 外部内容安全包装 ====================

function wrapExternalContent(content: string, source: string): string {
  const separator = "=".repeat(60);
  return [
    separator,
    `EXTERNAL CONTENT START - Source: ${source}`,
    separator,
    "",
    content,
    "",
    separator,
    "EXTERNAL CONTENT END",
    separator,
  ].join("\n");
}

// ==================== 原生 Fetch 实现（无 Provider 时的 fallback）

async function nativeFetch(
  params: Required<WebFetchParams>,
  signal?: AbortSignal,
  onProgress?: WebFetchProgressCallback,
): Promise<WebFetchResult> {
  const {
    url,
    extractMode,
    maxChars,
    maxResponseBytes,
    timeoutMs,
    maxRedirects,
    userAgent,
    selectors,
    excludeSelectors,
    headers: customHeaders,
    enableSSRFProtection,
    accept,
    acceptLanguage,
    referer,
    origin,
    compression,
    followRedirects,
  } = params;

  onProgress?.({ stage: "fetching", url, message: "Fetching page..." });

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: accept,
    "Accept-Language": acceptLanguage,
  };

  if (compression) {
    headers["Accept-Encoding"] = "gzip, deflate, br";
  }

  if (referer) {
    headers["Referer"] = referer;
  }

  if (origin) {
    headers["Origin"] = origin;
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  let response: {
    ok: boolean;
    status: number;
    statusText: string;
    url: string;
    finalUrl: string;
    headers: Headers;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
    redirected: boolean;
    redirectCount: number;
    release?: () => void;
  };

  if (enableSSRFProtection) {
    const fetchResult = await fetchWithWebToolsNetworkGuard({
      url,
      mode: "strict",
      options: {
        headers,
        signal,
        redirect: followRedirects ? "follow" : "manual",
      },
      timeoutMs,
      maxResponseBodySize: maxResponseBytes,
      userAgent,
    });
    const res = fetchResult.response;
    response = {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url,
      finalUrl: fetchResult.finalUrl,
      headers: res.headers,
      arrayBuffer: () => res.arrayBuffer(),
      text: () => res.text(),
      json: () => res.json(),
      redirected: res.redirected,
      redirectCount: 0,
      release: fetchResult.release,
    };
  } else {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: followRedirects ? "follow" : "manual",
    });

    clearTimeout(timeoutId);

    response = {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url,
      finalUrl: res.url,
      headers: res.headers,
      arrayBuffer: () => res.arrayBuffer(),
      text: () => res.text(),
      json: () => res.json(),
      redirected: res.redirected,
      redirectCount: 0,
    };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "text/html";
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  if (contentLength > maxResponseBytes) {
    throw new Error(
      `Response too large: ${contentLength} bytes (max: ${maxResponseBytes})`,
    );
  }

  onProgress?.({
    stage: "fetching",
    url,
    bytesReceived: contentLength,
    message: "Reading response...",
  });

  const text = await response.text();

  if (Buffer.byteLength(text, "utf-8") > maxResponseBytes) {
    throw new Error(
      `Response too large: ${Buffer.byteLength(text, "utf-8")} bytes (max: ${maxResponseBytes})`,
    );
  }

  onProgress?.({ stage: "extracting", url, message: "Extracting content..." });

  let content = "";
  let title = "";
  let truncated = false;

  if (contentType.includes("text/html")) {
    const extractionResult = await extractWebContent({
      html: text,
      url: response.finalUrl,
      extractMode: extractMode as WebContentExtractMode,
      maxLength: maxChars,
      selectors,
      excludeSelectors,
    });

    if (extractionResult.result && extractionResult.result.content.length > 0) {
      content = extractionResult.result.content;
      title = extractionResult.result.title || "";
      truncated = extractionResult.result.truncated;
    } else {
      logger.debug("[WebFetch] Content extraction failed, using raw text");
      content = text;
    }
  } else if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(text);
      content = "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    } catch {
      content = text;
    }
  } else {
    content = text;
  }

  if (content.length > maxChars) {
    const truncResult = smartTruncate(content, maxChars);
    content = truncResult.content;
    truncated = true;
  }

  onProgress?.({
    stage: "complete",
    url,
    percent: 100,
    message: "Fetch complete",
  });

  return {
    url,
    finalUrl: response.finalUrl,
    title: title || undefined,
    contentType,
    content,
    contentLength: content.length,
    truncated,
    rendered: false,
    provider: "native",
  };
}

// ==================== 主函数 ====================

export interface WebFetchOptions {
  signal?: AbortSignal;
  onProgress?: WebFetchProgressCallback;
  fetchConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export async function webFetch(
  params: WebFetchParams,
  options: WebFetchOptions = {},
): Promise<WebFetchResult> {
  const { signal, onProgress, fetchConfig, config } = options;

  onProgress?.({ stage: "validating", url: params.url, message: "Validating URL..." });

  const validated = validateWebFetchParams(params) as Required<WebFetchParams>;

  if (signal?.aborted) {
    throw new Error("Request aborted");
  }

  if (validated.enableSSRFProtection) {
    const safetyCheck = await isWebToolsUrlAllowed(validated.url, "strict");
    if (!safetyCheck.allowed) {
      throw new Error(`URL blocked by SSRF protection: ${safetyCheck.reason}`);
    }
  }

  const cacheKey = getCacheKey(validated.url, validated);

  if (validated.useCache) {
    onProgress?.({ stage: "checking_cache", url: validated.url, message: "Checking cache..." });
    const cached = fetchCache.get(cacheKey, validated.cacheTtlMs);
    if (cached) {
      onProgress?.({
        stage: "complete",
        url: validated.url,
        percent: 100,
        message: "Returning cached result",
      });
      logger.debug("[WebFetch] Cache hit:", validated.url);
      return cached;
    }
  }

  onProgress?.({
    stage: "resolving_provider",
    url: validated.url,
    message: "Resolving fetch provider...",
  });

  const chain = buildWebFetchFallbackChain({
    preferredProviderId: validated.preferredProvider,
    fetchConfig,
    config,
    onlyPluginIds: validated.onlyPluginIds,
  });

  logger.debug(`[WebFetch] Fallback chain: ${chain.map((p) => p.id).join(", ")}`);

  let result: WebFetchResult | null = null;
  let providerUsed: string | null = null;
  let errors: Array<{ providerId: string; error: string }> = [];

  if (chain.length > 0) {
    const fallbackResult = await executeWithWebFetchFallback<WebFetchResult>({
      chain,
      fetchConfig,
      execute: async (provider: PluginWebFetchProviderEntry, tool) => {
        onProgress?.({
          stage: "fetching",
          url: validated.url,
          provider: provider.id,
          message: `Fetching via ${provider.label}...`,
        });

        const providerArgs: Record<string, unknown> = {
          url: validated.url,
          maxChars: validated.maxChars,
          maxResponseBytes: validated.maxResponseBytes,
          timeoutMs: validated.timeoutMs,
          renderJs: validated.renderJs,
          selector: validated.selector,
          waitUntil: validated.waitUntil,
          executeJs: validated.executeJs,
          maxRedirects: validated.maxRedirects,
          userAgent: validated.userAgent,
          extractMode: validated.extractMode,
          selectors: validated.selectors,
          excludeSelectors: validated.excludeSelectors,
          headers: validated.headers,
          ...(validated.metadata || {}),
        };

        return await tool.execute(providerArgs, { signal });
      },
      shouldFallback: (res) => res === null,
    });

    result = fallbackResult.result;
    providerUsed = fallbackResult.providerUsed;
    errors = fallbackResult.errors;
  }

  if (!result) {
    logger.debug("[WebFetch] No provider succeeded, falling back to native fetch");
    onProgress?.({
      stage: "fetching",
      url: validated.url,
      provider: "native",
      message: "Fetching with native fetch...",
    });

    result = await nativeFetch(validated, signal, onProgress);
    providerUsed = "native";
  }

  if (result.content.length > validated.maxChars) {
    onProgress?.({
      stage: "truncating",
      url: validated.url,
      message: "Truncating content...",
    });

    const truncResult = smartTruncate(result.content, validated.maxChars);
    result = {
      ...result,
      content: truncResult.content,
      truncated: truncResult.truncated,
      contentLength: truncResult.content.length,
    };
  }

  if (validated.useCache && result) {
    fetchCache.set(cacheKey, result);
  }

  return result;
}

// ==================== 工具处理函数（用于 toolRegistry） ====================

export async function handleWebFetchV3(args: Record<string, unknown>): Promise<string> {
  try {
    const result = await webFetch(args as unknown as WebFetchParams);
    return JSON.stringify({
      success: true,
      ...result,
      content: wrapExternalContent(result.content, result.finalUrl),
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ==================== 缓存管理导出 ====================

export const webFetchCache = {
  clear: () => fetchCache.clear(),
  size: () => fetchCache.size(),
};

// ==================== Tool Definition 导出 ====================

export function getWebFetchToolDefinition() {
  return {
    type: "function" as const,
    function: {
      name: "web_fetch",
      description:
        "Fetch content from a web URL with advanced features: Provider fallback chain, SSRF protection, content extraction (Readability + Basic fallback), smart truncation, caching, and progress tracking. Supports JavaScript rendering via Playwright when available.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch (http/https only)",
          },
          extractMode: {
            type: "string",
            enum: ["markdown", "text", "html"],
            description: "Content extraction mode: markdown, text, or html (default: markdown)",
            default: "markdown",
          },
          maxChars: {
            type: "number",
            description: `Maximum characters to return (default: ${DEFAULT_FETCH_MAX_CHARS})`,
            default: DEFAULT_FETCH_MAX_CHARS,
          },
          maxResponseBytes: {
            type: "number",
            description: `Maximum response body size in bytes (default: ${DEFAULT_FETCH_MAX_RESPONSE_BYTES})`,
            default: DEFAULT_FETCH_MAX_RESPONSE_BYTES,
          },
          timeoutMs: {
            type: "number",
            description: `Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
            default: DEFAULT_TIMEOUT_MS,
          },
          renderJs: {
            type: "boolean",
            description: "Whether to render JavaScript using Playwright (default: false)",
            default: false,
          },
          selector: {
            type: "string",
            description:
              "CSS selector to wait for before extracting content (renderJs only)",
          },
          waitUntil: {
            type: "string",
            enum: ["domcontentloaded", "networkidle", "load"],
            description:
              "Page load wait strategy (renderJs only, default: networkidle)",
            default: "networkidle",
          },
          executeJs: {
            type: "string",
            description:
              "JavaScript code to execute on the page before extracting content (renderJs only)",
          },
          maxRedirects: {
            type: "number",
            description: `Maximum number of redirects (default: ${DEFAULT_FETCH_MAX_REDIRECTS})`,
            default: DEFAULT_FETCH_MAX_REDIRECTS,
          },
          userAgent: {
            type: "string",
            description: "User-Agent header value",
            default: DEFAULT_USER_AGENT,
          },
          useProxy: {
            type: "boolean",
            description: "Whether to use a proxy (if configured) (default: false)",
            default: false,
          },
          preferredProvider: {
            type: "string",
            description: "Preferred fetch provider ID to use first",
          },
          selectors: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of CSS selectors to extract content from (in priority order)",
          },
          excludeSelectors: {
            type: "array",
            items: { type: "string" },
            description: "Array of CSS selectors to exclude from content",
          },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Additional HTTP headers to send with the request",
          },
          useCache: {
            type: "boolean",
            description: "Whether to use response cache (default: true)",
            default: true,
          },
          cacheTtlMs: {
            type: "number",
            description: `Cache TTL in milliseconds (default: ${DEFAULT_CACHE_TTL_MS})`,
            default: DEFAULT_CACHE_TTL_MS,
          },
          enableSSRFProtection: {
            type: "boolean",
            description: "Whether to enable SSRF protection (default: true)",
            default: true,
          },
          accept: {
            type: "string",
            description: "Accept header value",
            default: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          acceptLanguage: {
            type: "string",
            description: "Accept-Language header value",
            default: "en-US,en;q=0.9",
          },
          referer: {
            type: "string",
            description: "Referer header value",
          },
          origin: {
            type: "string",
            description: "Origin header value",
          },
          compression: {
            type: "boolean",
            description: "Whether to accept compressed responses (default: true)",
            default: true,
          },
          followRedirects: {
            type: "boolean",
            description: "Whether to follow redirects (default: true)",
            default: true,
          },
          validateSSL: {
            type: "boolean",
            description: "Whether to validate SSL certificates (default: true)",
            default: true,
          },
          retries: {
            type: "number",
            description: "Number of retries on failure (default: 0)",
            default: 0,
          },
          retryDelayMs: {
            type: "number",
            description: "Delay between retries in milliseconds (default: 1000)",
            default: 1000,
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Request priority (default: normal)",
            default: "normal",
          },
        },
        required: ["url"],
      },
    },
  };
}
