/**
 * 移植自 openclaw/src/agents/tools/web-fetch.ts
 *
 * web_fetch built-in tool. cross-wms provides the URL sanitization helper
 * and a no-op tool factory since the full fetch infrastructure (SSRF guards,
 * caching, provider fallback, content extraction) is not available.
 */

/**
 * Sanitize a web_fetch URL parameter that may contain LLM-injected whitespace.
 *
 * Fixes the case where a model emits a space between the scheme and
 * authority (e.g. `https:// docs.openclaw.ai`), which causes `new URL()` to
 * throw. Path and query whitespace is intentionally preserved.
 */
export function sanitizeWebFetchUrl(raw: string): string {
  let end = raw.length;
  while (end > 0 && raw.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  const trimmed = raw.slice(0, end).replace(/^\s+/, "");
  const repaired = trimmed.replace(/^(https?:\/\/)\s+/i, "$1");
  return repaired.replace(/^(https?:\/\/[^/?#\s]+)\s+$/i, "$1");
}

/**
 * Creates the web_fetch tool. Returns null in cross-wms since the full
 * fetch infrastructure (SSRF guards, caching, readability extraction, provider
 * fallback) is not available.
 */
export function createWebFetchTool(_options?: {
  config?: unknown;
  sandboxed?: boolean;
  runtimeWebFetch?: unknown;
  lateBindRuntimeConfig?: boolean;
  lookupFn?: unknown;
}): null {
  // cross-wms lacks SSRF guards, content extractors, caching, and provider fallback.
  return null;
}
