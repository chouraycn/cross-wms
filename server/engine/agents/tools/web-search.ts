/**
 * web_search built-in tool.
 *
 * Runs the configured runtime provider and returns normalized cached search results.
 *
 * Ported from openclaw/src/agents/tools/web-search.ts.
 *
 * cross-wms adjustments:
 * - Relative imports to `../../config/types.openclaw.js`,
 *   `../../secrets/runtime-web-tools.types.js` are kept as-is because cross-wms
 *   exposes the same paths under server/engine/.
 * - Replaced `../../web-search/runtime.js` import of `runWebSearch` and
 *   `resolveWebSearchProviderId` with local stubs because cross-wms
 *   `server/engine/web-search/runtime.ts` exposes a different API
 *   (`SearchRuntime` class) than the openclaw runtime.
 * - `asToolParamsRecord` and `jsonResult` from openclaw `./common.js` are not
 *   exported by cross-wms common.ts, so local helpers are added.
 */
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { RuntimeWebSearchMetadata } from "../../secrets/runtime-web-tools.types.js";
import type { AnyAgentTool, AgentToolResult } from "./common.js";
import { MAX_SEARCH_COUNT, SEARCH_CACHE } from "./web-search-provider-common.js";
import { resolveWebSearchToolRuntimeContext } from "./web-tool-runtime-context.js";

/** Reads tool args as a record, normalizing non-object inputs to an empty record. */
function asToolParamsRecord(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

/** Serializes a payload as a JSON text content block. */
function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

type RunWebSearchParams = {
  config?: OpenClawConfig;
  agentDir?: string;
  sandboxed?: boolean;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
  preferRuntimeProviders?: boolean;
  args: Record<string, unknown>;
  signal?: AbortSignal;
};

type RunWebSearchResult = {
  result: Record<string, unknown>;
  provider: string;
};

/**
 * Stub for openclaw `runWebSearch`. cross-wms exposes a different runtime API
 * (`SearchRuntime` class); until that adapter is ported, this returns a
 * placeholder result so the tool can be type-checked.
 */
async function runWebSearch(_params: RunWebSearchParams): Promise<RunWebSearchResult> {
  return {
    result: { results: [], message: "web search runtime is not yet ported" },
    provider: "stub",
  };
}

/**
 * Stub for openclaw `resolveWebSearchProviderId`. Returns the configured
 * provider id when present, otherwise an empty string.
 */
function resolveWebSearchProviderId(params: {
  search?: { provider?: unknown } | null;
}): string {
  const provider = params.search?.provider;
  return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}

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

function isWebSearchDisabled(config?: OpenClawConfig): boolean {
  const search = config?.tools?.web?.search;
  return Boolean(search && typeof search === "object" && search.enabled === false);
}

/** Creates the `web_search` tool, or `null` when web search is disabled by config. */
export function createWebSearchTool(options?: {
  config?: OpenClawConfig;
  agentDir?: string;
  sandboxed?: boolean;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
  lateBindRuntimeConfig?: boolean;
}): AnyAgentTool | null {
  if (isWebSearchDisabled(options?.config)) {
    return null;
  }

  return {
    label: "Web Search",
    name: "web_search",
    description: "Search web for current info; returns normalized provider results.",
    parameters: WebSearchSchema as unknown as Record<
      string,
      {
        name: string;
        type: "string" | "number" | "boolean" | "object" | "any" | "array";
        description: string;
        required: boolean;
        default?: unknown;
        enum?: string[];
        items?: { type: string };
        properties?: Record<string, unknown>;
      }
    >,
    execute: async (_toolCallId: string, args: unknown, signal?: AbortSignal) => {
      // Late binding lets long-lived agents pick up runtime web-search credentials/config without
      // rebuilding the tool object.
      const { config, preferRuntimeProviders, runtimeWebSearch } =
        resolveWebSearchToolRuntimeContext({
          config: options?.config,
          lateBindRuntimeConfig: options?.lateBindRuntimeConfig,
          runtimeWebSearch: options?.runtimeWebSearch,
        });
      if (isWebSearchDisabled(config)) {
        throw new Error("web_search is disabled.");
      }
      const result = await runWebSearch({
        config,
        agentDir: options?.agentDir,
        sandboxed: options?.sandboxed,
        runtimeWebSearch,
        preferRuntimeProviders,
        args: asToolParamsRecord(args),
        signal,
      });
      return jsonResult({
        ...result.result,
        provider: result.provider,
      });
    },
  } as unknown as AnyAgentTool;
}

export const testing = {
  SEARCH_CACHE,
  resolveSearchProvider: (search?: Parameters<typeof resolveWebSearchProviderId>[0]["search"]) =>
    resolveWebSearchProviderId({ search }),
};
export { testing as __testing };
