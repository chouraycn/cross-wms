// Simple provider option helpers normalize lightweight provider configuration.
// Local type placeholders: openclaw llm-core types not yet present in cross-wms llm/types.ts.
/** Normalized reasoning-effort levels shared across provider-specific knobs. */
type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
/** Token budgets for each thinking level (token-based providers only). */
interface ThinkingBudgets {
  minimal?: number;
  low?: number;
  medium?: number;
  high?: number;
  max?: number;
}
/** Minimal model shape required by simple option helpers. */
type SimpleModel = {
  maxTokens?: number;
};
/** Streaming transport preference. */
type Transport = "sse" | "websocket" | "websocket-cached" | "auto";
/** Prompt-cache retention preference. */
type CacheRetention = "none" | "short" | "long";
/** Minimal HTTP response metadata. */
interface ProviderResponse {
  status: number;
  headers: Record<string, string>;
}
type MaybePromise<T> = T | Promise<T>;
/** Request options shared by text streaming providers. */
interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  signal?: AbortSignal;
  apiKey?: string;
  transport?: Transport;
  cacheRetention?: CacheRetention;
  sessionId?: string;
  promptCacheKey?: string;
  onPayload?: (payload: any, model: SimpleModel) => MaybePromise<any>;
  onResponse?: (response: ProviderResponse, model: SimpleModel) => void | Promise<void>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  metadata?: Record<string, any>;
}
/** Unified text options used by simple completion helpers. */
interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel;
  thinkingBudgets?: ThinkingBudgets;
}

export function buildBaseOptions(
  model: SimpleModel,
  options?: SimpleStreamOptions,
  apiKey?: string,
): StreamOptions {
  void model;
  return {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    stop: options?.stop,
    signal: options?.signal,
    apiKey: apiKey || options?.apiKey,
    transport: options?.transport,
    cacheRetention: options?.cacheRetention,
    sessionId: options?.sessionId,
    promptCacheKey: options?.promptCacheKey,
    headers: options?.headers,
    onPayload: options?.onPayload,
    onResponse: options?.onResponse,
    timeoutMs: options?.timeoutMs,
    maxRetries: options?.maxRetries,
    maxRetryDelayMs: options?.maxRetryDelayMs,
    metadata: options?.metadata,
  };
}

export function clampReasoning(
  effort: ThinkingLevel | undefined,
): Exclude<ThinkingLevel, "xhigh"> | undefined {
  return effort === "xhigh" ? "high" : effort;
}

export function adjustMaxTokensForThinking(
  // Undefined means no explicit caller cap. Use the model cap and fit thinking inside it.
  baseMaxTokens: number | undefined,
  modelMaxTokens: number,
  reasoningLevel: ThinkingLevel,
  customBudgets?: ThinkingBudgets,
): { maxTokens: number; thinkingBudget: number } {
  const defaultBudgets: ThinkingBudgets = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
    max: 32768,
  };
  const budgets = { ...defaultBudgets, ...customBudgets };

  const minOutputTokens = 1024;
  const level = clampReasoning(reasoningLevel)!;
  let thinkingBudget = budgets[level]!;
  const maxTokens =
    baseMaxTokens === undefined
      ? modelMaxTokens
      : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);

  if (maxTokens <= thinkingBudget) {
    thinkingBudget = Math.max(0, maxTokens - minOutputTokens);
  }

  return { maxTokens, thinkingBudget };
}
