/**
 * Ported from openclaw/src/agents/openrouter-model-capabilities.ts
 *
 * OpenRouter model capabilities cache.
 * Cross-wms degradation: returns empty capabilities without API fetching.
 */

export type OpenRouterModelCapabilities = Record<string, unknown>;

let cachedCapabilities: OpenRouterModelCapabilities | undefined;

/** Loads OpenRouter model capabilities from the API. */
export async function loadOpenRouterModelCapabilities(
  _params?: Record<string, unknown>,
): Promise<OpenRouterModelCapabilities> {
  // Cross-wms does not have OpenRouter API access; return empty.
  cachedCapabilities = {};
  return cachedCapabilities;
}

/** Returns cached OpenRouter model capabilities. */
export function getOpenRouterModelCapabilities(): OpenRouterModelCapabilities | undefined {
  return cachedCapabilities;
}
