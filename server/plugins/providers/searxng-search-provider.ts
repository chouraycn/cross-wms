/**
 * SearXNG Search Provider — SearXNG 搜索 Provider 实现
 *
 * Self-hosted meta-search with no API key required.
 * https://docs.searxng.org/
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
  baseUrl: string,
  query: string,
  numResults: number,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    const searchUrl = new URL("/search", baseUrl);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("safesearch", "1");
    searchUrl.searchParams.set("limit", String(numResults));

    const response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`SearXNG 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as unknown[];
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "searxng",
    };

    return resultList;
  } catch (e) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (e instanceof DOMException && e.name === "AbortError") {
      if (signal?.aborted) {
        throw e;
      }
      throw new Error("SearXNG 搜索超时（15秒）");
    }
    throw e;
  }
}

function normalizeResults(data: unknown[]): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  if (!Array.isArray(data)) {
    return results;
  }

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const title = String((item as Record<string, unknown>).title || "").trim();
    const url = String((item as Record<string, unknown>).url || "").trim();
    const snippet = String((item as Record<string, unknown>).content || "").trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "searxng",
  label: "SearXNG Search",
  hint: "Self-hosted meta-search - configure your own SearXNG instance",
  requiresCredential: true,
  credentialLabel: "SearXNG Base URL",
  envVars: ["SEARXNG_BASE_URL"],
  placeholder: "http://localhost:8080",
  signupUrl: "https://docs.searxng.org/",
  docsUrl: "https://docs.searxng.org/",
  autoDetectOrder: 200,
  credentialPath: "tools.web.search.providers.searxng.baseUrl",
  inactiveSecretPaths: [],

  getCredentialValue(searchConfig?: Record<string, unknown>): unknown {
    return getNestedValue(searchConfig, "baseUrl");
  },

  setCredentialValue(searchConfigTarget: Record<string, unknown>, value: unknown): void {
    setNestedValue(searchConfigTarget, "baseUrl", value);
  },

  getConfiguredCredentialValue(config: Record<string, unknown>): unknown {
    return getNestedValue(config, this.credentialPath);
  },

  setConfiguredCredentialValue(configTarget: Record<string, unknown>, value: unknown): void {
    setNestedValue(configTarget, this.credentialPath, value);
  },

  createTool(ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    let baseUrl: string | undefined;

    const configValue = this.getCredentialValue(ctx.searchConfig);
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      baseUrl = String(configValue);
    }

    if (!baseUrl) {
      for (const envVar of this.envVars) {
        const envValue = process.env[envVar];
        if (envValue && envValue.trim() !== "") {
          baseUrl = envValue.trim();
          break;
        }
      }
    }

    if (!baseUrl) {
      return null;
    }

    return {
      description: "Search the web using SearXNG, a self-hosted meta-search engine.",
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
          baseUrl!,
          query,
          numResults,
          context?.signal,
        );
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("searxng", plugin);

export default plugin;
