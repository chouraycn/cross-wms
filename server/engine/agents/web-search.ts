/**
 * web_search built-in tool.
 * Ported from openclaw/src/agents/tools/web-search.ts
 *
 * The full implementation requires the web-search runtime provider system.
 * This adapted version returns null (tool disabled) when no provider is available.
 */

const MAX_SEARCH_COUNT = 10;

const WebSearchSchema = {
  type: "object",
  required: ["query"],
  properties: {
    query: { type: "string", description: "Search query." },
    count: {
      type: "number",
      description: "Result count.",
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    },
    country: {
      type: "string",
      description: "2-letter country code.",
    },
    language: {
      type: "string",
      description: "ISO 639-1 language.",
    },
    freshness: {
      type: "string",
      description: "Time filter: day/week/month/year.",
    },
    date_after: {
      type: "string",
      description: "Published after YYYY-MM-DD.",
    },
    date_before: {
      type: "string",
      description: "Published before YYYY-MM-DD.",
    },
    search_lang: {
      type: "string",
      description: "Brave result language.",
    },
    ui_lang: {
      type: "string",
      description: "Brave UI locale.",
    },
    domain_filter: {
      type: "array",
      items: { type: "string" },
      description: "Perplexity domain filter.",
    },
    max_tokens: {
      type: "number",
      description: "Perplexity total token budget.",
      minimum: 1,
      maximum: 1000000,
    },
    max_tokens_per_page: {
      type: "number",
      description: "Perplexity tokens per page.",
      minimum: 1,
    },
  },
} satisfies Record<string, unknown>;

function isWebSearchDisabled(config?: Record<string, unknown>): boolean {
  const tools = config?.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) return false;
  const web = (tools as Record<string, unknown>).web;
  if (!web || typeof web !== "object" || Array.isArray(web)) return false;
  const search = (web as Record<string, unknown>).search;
  if (!search || typeof search !== "object" || Array.isArray(search)) return false;
  return (search as Record<string, unknown>).enabled === false;
}

type AnyAgentTool = {
  label: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, args: unknown, signal: AbortSignal) => Promise<unknown>;
};

/** Creates the `web_search` tool, or `null` when web search is disabled by config or no runtime is available. */
export function createWebSearchTool(options?: {
  config?: Record<string, unknown>;
  agentDir?: string;
  sandboxed?: boolean;
  runtimeWebSearch?: unknown;
  lateBindRuntimeConfig?: boolean;
}): AnyAgentTool | null {
  if (isWebSearchDisabled(options?.config)) {
    return null;
  }

  // In cross-wms without the full web-search runtime, return null to indicate
  // the tool is not available. Callers should handle this gracefully.
  return null;
}

/** Test-only utilities for web search tool discovery state. */
export const testing = {
  SEARCH_CACHE: MAX_SEARCH_COUNT,
  resolveSearchProvider: (_search?: unknown): { provider: string | null } => {
    return { provider: null };
  },
};
export const testing_web_search = testing;
