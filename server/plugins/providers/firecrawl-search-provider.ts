/**
 * Firecrawl Search Provider — Firecrawl 搜索 Provider 实现
 *
 * Structured results with optional result scraping.
 * https://firecrawl.dev/
 */

import type {
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderContext,
  WebSearchResultList,
  WebSearchResult,
} from "../web-provider-types.js";
import { registerWebSearchProvider } from "../web-search-providers.js";

// ==================== 凭证辅助 ====================

function getNestedValue(obj: Record<string, unknown> | undefined, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ==================== API 调用 ====================

const DEFAULT_TIMEOUT = 15000;

async function performSearch(
  apiKey: string,
  query: string,
  numResults: number,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const response = await fetch("https://api.firecrawl.dev/v0/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        pageOptions: {
          onlyMainContent: true,
        },
        limit: numResults,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Firecrawl 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "firecrawl",
    };

    return resultList;
  } catch (e) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (e instanceof DOMException && e.name === "AbortError") {
      if (signal?.aborted) {
        throw e;
      }
      throw new Error("Firecrawl 搜索超时（15秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const items = (data as any).data;
  if (!Array.isArray(items)) {
    return results;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title || "").trim();
    const url = String(item.url || "").trim();
    const snippet = String(item.description || item.rawContent || "").trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "firecrawl",
  label: "Firecrawl Search",
  hint: "Structured results with optional result scraping",
  requiresCredential: true,
  credentialLabel: "Firecrawl API Key",
  envVars: ["FIRECRAWL_API_KEY"],
  placeholder: "fc-...",
  signupUrl: "https://www.firecrawl.dev/",
  docsUrl: "https://docs.firecrawl.dev/",
  autoDetectOrder: 20,
  credentialPath: "tools.web.search.providers.firecrawl.apiKey",
  inactiveSecretPaths: [],

  getCredentialValue(searchConfig?: Record<string, unknown>): unknown {
    return getNestedValue(searchConfig, "apiKey");
  },

  setCredentialValue(searchConfigTarget: Record<string, unknown>, value: unknown): void {
    setNestedValue(searchConfigTarget, "apiKey", value);
  },

  getConfiguredCredentialValue(config: Record<string, unknown>): unknown {
    return getNestedValue(config, this.credentialPath);
  },

  setConfiguredCredentialValue(configTarget: Record<string, unknown>, value: unknown): void {
    setNestedValue(configTarget, this.credentialPath, value);
  },

  createTool(ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    let apiKey: string | undefined;

    const configValue = this.getCredentialValue(ctx.searchConfig);
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      apiKey = String(configValue);
    }

    if (!apiKey) {
      for (const envVar of this.envVars) {
        const envValue = process.env[envVar];
        if (envValue && envValue.trim() !== "") {
          apiKey = envValue.trim();
          break;
        }
      }
    }

    if (!apiKey) {
      return null;
    }

    return {
      description: "Search the web using Firecrawl Search API, structured results with content scraping.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          numResults: {
            type: "number",
            description: "Maximum number of results to return",
            default: 10,
          },
        },
        required: ["query"],
      },
      async execute(
        args: Record<string, unknown>,
        context?: { signal?: AbortSignal },
      ): Promise<WebSearchResultList> {
        const query = String(args.query || "").trim();
        if (!query) {
          throw new Error("搜索关键词不能为空");
        }

        const numResults = Math.min(Number(args.numResults || args.count || args.maxResults || 10), 20);

        return performSearch(
          apiKey!,
          query,
          numResults,
          context?.signal,
        );
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("firecrawl", plugin);

export default plugin;
