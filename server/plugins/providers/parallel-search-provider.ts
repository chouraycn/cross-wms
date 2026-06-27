/**
 * Parallel Web Search Provider — 并行多源搜索聚合 Provider
 *
 * 并行调用多个已注册的搜索 Provider，聚合并去重结果，
 * 提供更全面的搜索结果。
 */

import type {
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderContext,
  WebSearchResultList,
  WebSearchResult,
} from "../web-provider-types.js";
import {
  registerWebSearchProvider,
  getWebSearchProviders,
  createWebSearchTool,
} from "../web-search-providers.js";

// ==================== 缓存 ====================

interface CacheEntry {
  results: WebSearchResultList;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 200;
const cache = new Map<string, CacheEntry>();

function getCacheKey(query: string, count: number, providers: string): string {
  return `${query.toLowerCase()}:${count}:${providers}`;
}

function getFromCache(key: string): WebSearchResultList | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function setInCache(key: string, results: WebSearchResultList): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, { results, timestamp: Date.now() });
}

// ==================== 结果扩展类型 ====================

interface ParallelResult extends WebSearchResult {
  source?: string;
}

// ==================== 工具函数 ====================

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, "");
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

function deduplicateResults(results: ParallelResult[]): ParallelResult[] {
  const seen = new Set<string>();
  const deduped: ParallelResult[] = [];

  for (const result of results) {
    const key = normalizeUrl(result.url);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(result);
    }
  }

  return deduped;
}

// ==================== 搜索执行 ====================

async function performSearch(
  query: string,
  count: number,
  providerIds: string[],
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count, providerIds.sort().join(","));
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const allProviders = getWebSearchProviders();
  const availableProviders = allProviders.filter(
    (p) => p.id !== "parallel" && (providerIds.length === 0 || providerIds.includes(p.id)),
  );

  if (availableProviders.length === 0) {
    throw new Error("没有可用的搜索 Provider");
  }

  const perProviderCount = Math.ceil(count * 1.5);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  const forwardSignal = controller.signal;

  try {
    const promises = availableProviders.map(async (provider) => {
      try {
        const tool = createWebSearchTool(provider);
        if (!tool) {
          return null;
        }
        const result = await tool.execute(
          { query, count: perProviderCount },
          { signal: forwardSignal },
        );
        return result;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    const allResults: ParallelResult[] = [];

    for (const result of results) {
      if (!result) continue;
      for (const r of result.results) {
        allResults.push({
          ...r,
          source: result.provider,
        });
      }
    }

    const deduped = deduplicateResults(allResults);
    const finalResults = deduped.slice(0, count);

    const resultList: WebSearchResultList & { results: ParallelResult[] } = {
      query,
      results: finalResults,
      count: finalResults.length,
      provider: "parallel",
    };

    setInCache(cacheKey, resultList);
    return resultList;
  } catch (e) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (e instanceof DOMException && e.name === "AbortError") {
      if (signal?.aborted) {
        throw e;
      }
      throw new Error("并行搜索超时（10秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "parallel",
  label: "Parallel",
  hint: "Parallel multi-source search aggregation",
  requiresCredential: false,
  envVars: [],
  placeholder: "",
  signupUrl: "",
  docsUrl: "",
  autoDetectOrder: 70,
  credentialPath: "",
  inactiveSecretPaths: [],

  getCredentialValue(): unknown {
    return undefined;
  },

  setCredentialValue(): void {
    // no-op: Parallel 不需要凭证
  },

  createTool(_ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    return {
      description:
        "Search the web using multiple providers in parallel, aggregating and deduplicating results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          count: {
            type: "number",
            description: "Maximum number of results to return",
            default: 8,
          },
          providers: {
            type: "array",
            description:
              "List of provider IDs to use (e.g. ['duckduckgo', 'searxng']). If empty, uses all available providers.",
            items: {
              type: "string",
            },
            default: [],
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

        const count = Math.min(Number(args.count) || 8, 50);
        const providersArg = args.providers;
        const providerIds: string[] = Array.isArray(providersArg)
          ? providersArg.map((p) => String(p))
          : [];

        return performSearch(query, count, providerIds, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("parallel", plugin);

export default plugin;
