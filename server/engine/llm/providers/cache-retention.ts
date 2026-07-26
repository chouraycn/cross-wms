// Type placeholder for openclaw CacheRetention (cross-wms llm/types.ts does not export it yet).
/** Prompt-cache retention preference shared by providers that expose cache controls. */
export type CacheRetention = "none" | "short" | "long";

/**
 * Resolve cache retention preference.
 * Defaults to "short" and uses OPENCLAW_CACHE_RETENTION for backward compatibility.
 */
export function resolveCacheRetention(cacheRetention?: CacheRetention): CacheRetention {
  if (cacheRetention) {
    return cacheRetention;
  }
  if (typeof process !== "undefined" && process.env.OPENCLAW_CACHE_RETENTION === "long") {
    return "long";
  }
  return "short";
}
