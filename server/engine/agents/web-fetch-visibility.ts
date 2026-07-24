/**
 * Ported from openclaw/src/agents/tools/web-fetch-visibility.ts
 *
 * HTML sanitization and invisible unicode stripping for web fetch results.
 * Cross-wms degradation: simplified implementations without full HTML parsing.
 */

/** Sanitizes HTML content for safe display. */
export function sanitizeHtml(html: string): string {
  if (typeof html !== "string") {
    return "";
  }
  // Minimal sanitization: strip script tags and event handlers.
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, "");
}

/** Strips invisible unicode characters from text. */
export function stripInvisibleUnicode(text: string): string {
  if (typeof text !== "string") {
    return "";
  }
  // Remove common invisible unicode categories: control chars, zero-width chars,
  // BOM, and soft hyphens.
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F\u00AD\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, "");
}
