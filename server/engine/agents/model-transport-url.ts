/**
 * Debug formatting helpers for model transport endpoints.
 * Ported from openclaw/src/agents/model-transport-url.ts
 */

/** Return a sanitized URL suitable for logs and diagnostics. */
export function formatModelTransportDebugUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "<invalid-url>";
  }
}

/** Format a configured base URL for debug output, or the implicit default. */
export function formatModelTransportDebugBaseUrl(rawUrl: string | undefined): string {
  return rawUrl ? formatModelTransportDebugUrl(rawUrl) : "default";
}
