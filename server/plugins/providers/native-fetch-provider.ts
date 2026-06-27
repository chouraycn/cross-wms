/**
 * Native Fetch Provider — 基于 Node.js 原生 fetch 的网页抓取 Provider
 *
 * 使用 Node.js 原生 fetch + SSRF 防护抓取网页，
 * 集成 Readability 内容提取，支持 JS 渲染（Playwright 可选）。
 * 作为默认的 fetch Provider，autoDetectOrder 较低。
 */

import type {
  WebFetchProviderPlugin,
  WebFetchProviderToolDefinition,
  WebFetchProviderContext,
  WebFetchResult,
} from "../web-provider-types.js";
import { registerWebFetchProvider } from "../web-fetch-providers.js";
import { fetchWithWebToolsNetworkGuard } from "../../engine/web-guarded-fetch.js";
import { extractWebContent } from "../web-content-extractors.js";
import type { WebContentExtractMode } from "../web-content-extractor-types.js";
import { logger } from "../../logger.js";

// ==================== 常量 ====================

const DEFAULT_MAX_RESPONSE_BYTES = 750 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ==================== Playwright 渲染辅助 ====================

async function tryRenderWithPlaywright(
  url: string,
  options?: {
    selector?: string;
    waitUntil?: "domcontentloaded" | "networkidle" | "load";
    executeJs?: string;
    timeoutMs?: number;
  },
): Promise<{ html: string; title: string; finalUrl: string } | null> {
  try {
    const { renderContent } = await import("../../services/browserHostClient.js");
    const result = await renderContent({
      url,
      waitUntil: options?.waitUntil || "domcontentloaded",
      selector: options?.selector,
      timeout: options?.timeoutMs || 15000,
      ...(options?.executeJs ? { executeJs: options.executeJs } : {}),
    });
    if (result.ok && result.html) {
      return { html: result.html, title: result.title || "", finalUrl: result.url || url };
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== 智能截断 ====================

function smartTruncate(
  text: string,
  maxChars: number,
): { content: string; truncated: boolean } {
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

// ==================== 抓取执行 ====================

interface NativeFetchOptions {
  url: string;
  extractMode?: WebContentExtractMode;
  maxChars?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  renderJs?: boolean;
  selector?: string;
  waitUntil?: "domcontentloaded" | "networkidle" | "load";
  executeJs?: string;
  maxRedirects?: number;
  userAgent?: string;
  selectors?: string[];
  excludeSelectors?: string[];
  headers?: Record<string, string>;
  enableSSRFProtection?: boolean;
  accept?: string;
  acceptLanguage?: string;
  referer?: string;
  origin?: string;
  signal?: AbortSignal;
}

async function performNativeFetch(options: NativeFetchOptions): Promise<WebFetchResult> {
  const {
    url,
    extractMode = "markdown",
    maxChars = 20000,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    renderJs = false,
    selector,
    waitUntil = "networkidle",
    executeJs,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    userAgent = DEFAULT_USER_AGENT,
    selectors,
    excludeSelectors,
    headers: customHeaders,
    enableSSRFProtection = true,
    accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    acceptLanguage = "en-US,en;q=0.9",
    referer,
    origin,
    signal,
  } = options;

  let finalUrl = url;
  let html = "";
  let title = "";
  let rendered = false;
  let contentType = "text/html";

  // ---- JS 渲染模式 ----
  if (renderJs) {
    const renderedResult = await tryRenderWithPlaywright(url, {
      selector,
      waitUntil,
      executeJs,
      timeoutMs,
    });
    if (renderedResult) {
      html = renderedResult.html;
      title = renderedResult.title;
      finalUrl = renderedResult.finalUrl;
      rendered = true;
    }
  }

  // ---- 原生 fetch 模式 ----
  if (!rendered) {
    const headers: Record<string, string> = {
      "User-Agent": userAgent,
      Accept: accept,
      "Accept-Language": acceptLanguage,
    };

    if (referer) {
      headers["Referer"] = referer;
    }
    if (origin) {
      headers["Origin"] = origin;
    }
    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    let fetchResult;
    if (enableSSRFProtection) {
      fetchResult = await fetchWithWebToolsNetworkGuard({
        url,
        mode: "strict",
        options: {
          headers,
          signal,
          redirect: "follow",
        },
        timeoutMs,
        maxResponseBodySize: maxResponseBytes,
        userAgent,
      });
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

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      fetchResult = {
        response,
        finalUrl: response.url,
        release: () => {},
      };
    }

    const { response, finalUrl: guardedFinalUrl, release } = fetchResult;
    finalUrl = guardedFinalUrl;

    if (!response.ok) {
      release?.();
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    contentType = response.headers.get("content-type") || "text/html";
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    if (contentLength > maxResponseBytes) {
      release?.();
      throw new Error(
        `Response too large: ${contentLength} bytes (max: ${maxResponseBytes})`,
      );
    }

    const text = await response.text();
    release?.();

    if (Buffer.byteLength(text, "utf-8") > maxResponseBytes) {
      throw new Error(
        `Response too large: ${Buffer.byteLength(text, "utf-8")} bytes (max: ${maxResponseBytes})`,
      );
    }

    if (contentType.includes("text/html")) {
      html = text;
    } else if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(text);
        const content = "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
        const truncResult = smartTruncate(content, maxChars);
        return {
          url,
          finalUrl,
          contentType,
          content: truncResult.content,
          contentLength: truncResult.content.length,
          truncated: truncResult.truncated,
          rendered: false,
          provider: "native-fetch",
        };
      } catch {
        const truncResult = smartTruncate(text, maxChars);
        return {
          url,
          finalUrl,
          contentType,
          content: truncResult.content,
          contentLength: truncResult.content.length,
          truncated: truncResult.truncated,
          rendered: false,
          provider: "native-fetch",
        };
      }
    } else {
      const truncResult = smartTruncate(text, maxChars);
      return {
        url,
        finalUrl,
        contentType,
        content: truncResult.content,
        contentLength: truncResult.content.length,
        truncated: truncResult.truncated,
        rendered: false,
        provider: "native-fetch",
      };
    }
  }

  // ---- HTML 内容提取 ----
  const extractionResult = await extractWebContent({
    html,
    url: finalUrl,
    extractMode: extractMode as WebContentExtractMode,
    maxLength: maxChars,
    selectors,
    excludeSelectors,
  });

  let content = "";
  let truncated = false;

  if (extractionResult.result && extractionResult.result.content.length > 0) {
    content = extractionResult.result.content;
    title = title || extractionResult.result.title || "";
    truncated = extractionResult.result.truncated;
  } else {
    logger.debug("[NativeFetchProvider] Content extraction failed, using raw HTML truncation");
    const truncResult = smartTruncate(html, maxChars);
    content = truncResult.content;
    truncated = truncResult.truncated;
  }

  if (content.length > maxChars) {
    const truncResult = smartTruncate(content, maxChars);
    content = truncResult.content;
    truncated = true;
  }

  return {
    url,
    finalUrl,
    title: title || undefined,
    contentType,
    content,
    contentLength: content.length,
    truncated,
    rendered,
    provider: "native-fetch",
  };
}

// ==================== Provider 定义 ====================

const plugin: WebFetchProviderPlugin = {
  id: "native-fetch",
  label: "Native Fetch",
  hint: "Node.js 原生 fetch，无需 API Key",
  requiresCredential: false,
  envVars: [],
  placeholder: "",
  signupUrl: "",
  docsUrl: "",
  autoDetectOrder: 90,
  credentialPath: "",
  inactiveSecretPaths: [],

  getCredentialValue(): unknown {
    return undefined;
  },

  setCredentialValue(): void {
    // no-op: Native Fetch 不需要凭证
  },

  createTool(_ctx: WebFetchProviderContext): WebFetchProviderToolDefinition | null {
    return {
      description:
        "Fetch web content using Node.js native fetch with SSRF protection and Readability content extraction.",
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
            description: "Content extraction mode (default: markdown)",
            default: "markdown",
          },
          maxChars: {
            type: "number",
            description: "Maximum characters to return (default: 20000)",
            default: 20000,
          },
          maxResponseBytes: {
            type: "number",
            description: "Maximum response body size in bytes (default: 750000)",
            default: 750000,
          },
          timeoutMs: {
            type: "number",
            description: "Request timeout in milliseconds (default: 10000)",
            default: 10000,
          },
          renderJs: {
            type: "boolean",
            description: "Whether to render JavaScript using Playwright (default: false)",
            default: false,
          },
          selector: {
            type: "string",
            description: "CSS selector to wait for before extracting content (renderJs only)",
          },
          waitUntil: {
            type: "string",
            enum: ["domcontentloaded", "networkidle", "load"],
            description: "Page load wait strategy (renderJs only, default: networkidle)",
            default: "networkidle",
          },
          executeJs: {
            type: "string",
            description: "JavaScript code to execute on the page (renderJs only)",
          },
          maxRedirects: {
            type: "number",
            description: "Maximum number of redirects (default: 3)",
            default: 3,
          },
          userAgent: {
            type: "string",
            description: "User-Agent header value",
          },
          selectors: {
            type: "array",
            items: { type: "string" },
            description: "Array of CSS selectors to extract content from (in priority order)",
          },
          excludeSelectors: {
            type: "array",
            items: { type: "string" },
            description: "Array of CSS selectors to exclude from content",
          },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Additional HTTP headers",
          },
          enableSSRFProtection: {
            type: "boolean",
            description: "Whether to enable SSRF protection (default: true)",
            default: true,
          },
        },
        required: ["url"],
      },
      async execute(
        args: Record<string, unknown>,
        context?: { signal?: AbortSignal },
      ): Promise<WebFetchResult> {
        const url = String(args.url || "").trim();
        if (!url) {
          throw new Error("URL cannot be empty");
        }

        try {
          new URL(url);
        } catch {
          throw new Error(`Invalid URL: ${url}`);
        }

        return performNativeFetch({
          url,
          extractMode: args.extractMode as WebContentExtractMode | undefined,
          maxChars: args.maxChars ? Number(args.maxChars) : undefined,
          maxResponseBytes: args.maxResponseBytes ? Number(args.maxResponseBytes) : undefined,
          timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
          renderJs: args.renderJs === true,
          selector: args.selector ? String(args.selector) : undefined,
          waitUntil: args.waitUntil as "domcontentloaded" | "networkidle" | "load" | undefined,
          executeJs: args.executeJs ? String(args.executeJs) : undefined,
          maxRedirects: args.maxRedirects ? Number(args.maxRedirects) : undefined,
          userAgent: args.userAgent ? String(args.userAgent) : undefined,
          selectors: args.selectors as string[] | undefined,
          excludeSelectors: args.excludeSelectors as string[] | undefined,
          headers: args.headers as Record<string, string> | undefined,
          enableSSRFProtection: args.enableSSRFProtection !== false,
          accept: args.accept ? String(args.accept) : undefined,
          acceptLanguage: args.acceptLanguage ? String(args.acceptLanguage) : undefined,
          referer: args.referer ? String(args.referer) : undefined,
          origin: args.origin ? String(args.origin) : undefined,
          signal: context?.signal,
        });
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebFetchProvider("native-fetch", plugin);

export default plugin;
