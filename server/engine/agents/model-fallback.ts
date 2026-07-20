/**
 * 移植自 openclaw/src/agents/model-fallback.ts
 *
 * Model fallback chain resolution.
 * Simplified for cross-wms: no plugin manifest fallbacks; uses built-in chains only.
 */

import { type ModelRef, modelKey } from "./model-selection-normalize.js";

const BUILT_IN_FALLBACK_CHAINS: Record<string, string[]> = {
  "anthropic/claude-opus-4-8": ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-6"],
  "anthropic/claude-opus-4-7": ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-6"],
  "anthropic/claude-sonnet-4-6": ["anthropic/claude-opus-4-6", "anthropic/claude-haiku-4-5"],
  "openai/gpt-5.5": ["openai/gpt-5.2", "openai/gpt-4.1"],
  "google/gemini-3.1-pro-preview": ["google/gemini-3-flash-preview"],
  "deepseek/deepseek-v4-pro": ["deepseek/deepseek-v4-flash"],
  "xai/grok-4.3": ["xai/grok-3"],
};

/** Resolve the fallback model chain for a given model key. */
export function resolveFallbackModelChain(params: {
  key: string;
  maxFallbacks?: number;
}): string[] {
  const chain = BUILT_IN_FALLBACK_CHAINS[params.key] ?? [];
  const max = params.maxFallbacks ?? chain.length;
  return chain.slice(0, max);
}

/** Resolve the next fallback model ref after the current one fails. */
export function resolveNextFallbackModelRef(params: {
  current: ModelRef;
  failedKeys: ReadonlySet<string>;
  maxFallbacks?: number;
}): ModelRef | null {
  const currentKey = modelKey(params.current.provider, params.current.model);
  const chain = resolveFallbackModelChain({ key: currentKey, maxFallbacks: params.maxFallbacks });
  for (const fallbackKey of chain) {
    if (params.failedKeys.has(fallbackKey)) {
      continue;
    }
    const separator = fallbackKey.indexOf("/");
    if (separator < 0) {
      continue;
    }
    return { provider: fallbackKey.slice(0, separator), model: fallbackKey.slice(separator + 1) };
  }
  return null;
}

/** Build a complete fallback chain starting from a model ref. */
export function buildFallbackChain(params: {
  primary: ModelRef;
  maxFallbacks?: number;
}): ModelRef[] {
  const primaryKey = modelKey(params.primary.provider, params.primary.model);
  const chain = resolveFallbackModelChain({ key: primaryKey, maxFallbacks: params.maxFallbacks });
  const refs: ModelRef[] = [params.primary];
  for (const fallbackKey of chain) {
    const separator = fallbackKey.indexOf("/");
    if (separator < 0) {
      continue;
    }
    refs.push({ provider: fallbackKey.slice(0, separator), model: fallbackKey.slice(separator + 1) });
  }
  return refs;
}

/** Check if a model key has any built-in fallback chain. */
export function hasFallbackChain(key: string): boolean {
  return key in BUILT_IN_FALLBACK_CHAINS;
}

/** Get all model keys that have fallback chains. */
export function getModelsWithFallbackChains(): string[] {
  return Object.keys(BUILT_IN_FALLBACK_CHAINS);
}
