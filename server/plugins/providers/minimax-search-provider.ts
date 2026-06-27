/**
 * MiniMax Web Search Provider — MiniMax 搜索 API Provider 实现
 *
 * 基于 MiniMax API 的网页搜索，需要 API Key 和 Group ID。
 * 支持网页搜索，返回标题、链接和摘要。
 */

import type {
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchProviderContext,
  WebSearchResultList,
  WebSearchResult,
} from "../web-provider-types.js";
import { registerWebSearchProvider } from "../web-search-providers.js";

// ==================== 缓存 ====================

interface CacheEntry {
  results: WebSearchResultList;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, CacheEntry>();

function getCacheKey(query: string, count: number): string {
  return `${query.toLowerCase()}:${count}`;
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
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, { results, timestamp: Date.now() });
}

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

const DEFAULT_TIMEOUT = 10000;

async function performSearch(
  apiKey: string,
  groupId: string | undefined,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<WebSearchResultList> {
  const cacheKey = getCacheKey(query, count);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    let url = "https://api.minimax.chat/v1/web_search";
    if (groupId) {
      url += `?GroupId=${encodeURIComponent(groupId)}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: count,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`MiniMax 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "minimax",
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
      throw new Error("MiniMax 搜索超时（10秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  const items = data.results || data.data || data.items || (data as { search_results?: unknown[] }).search_results;
  if (!Array.isArray(items)) {
    return results;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title || "").trim();
    const url = String(item.url || item.link || "").trim();
    const snippet = String(item.snippet || item.description || item.content || item.summary || "").trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "minimax",
  label: "Minimax",
  hint: "MiniMax 搜索 API",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["MINIMAX_API_KEY", "MINIMAX_GROUP_ID"],
  placeholder: "eyJhbGciOiJ...",
  signupUrl: "https://platform.minimaxi.com/",
  docsUrl: "https://platform.minimaxi.com/document/",
  autoDetectOrder: 45,
  credentialPath: "tools.web.search.providers.minimax.apiKey",
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
    let groupId: string | undefined;

    const configValue = this.getCredentialValue(ctx.searchConfig);
    if (configValue !== undefined && configValue !== null && configValue !== "") {
      apiKey = String(configValue);
    }

    const groupIdConfigValue = getNestedValue(ctx.searchConfig, "groupId");
    if (groupIdConfigValue !== undefined && groupIdConfigValue !== null && groupIdConfigValue !== "") {
      groupId = String(groupIdConfigValue);
    }

    if (!apiKey) {
      const envApiKey = process.env["MINIMAX_API_KEY"];
      if (envApiKey && envApiKey.trim() !== "") {
        apiKey = envApiKey.trim();
      }
    }

    if (!groupId) {
      const envGroupId = process.env["MINIMAX_GROUP_ID"];
      if (envGroupId && envGroupId.trim() !== "") {
        groupId = envGroupId.trim();
      }
    }

    if (!apiKey) {
      return null;
    }

    return {
      description: "使用 MiniMax 搜索 API 搜索网页。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
          count: {
            type: "number",
            description: "返回结果的最大数量（最多 20 条）",
            default: 8,
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

        const count = Math.min(Number(args.count) || 8, 20);

        return performSearch(apiKey!, groupId, query, count, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("minimax", plugin);

export default plugin;
