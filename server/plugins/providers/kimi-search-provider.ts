/**
 * Kimi Web Search Provider — Kimi 智能搜索 Provider 实现
 *
 * 基于 Moonshot API 的 Kimi 智能搜索，需要 API Key。
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

const DEFAULT_TIMEOUT = 15000;
const KIMI_SEARCH_MODEL = "moonshot-v1-8k";

async function performSearch(
  apiKey: string,
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
    // Kimi 通过 chat completions + 内置 web_search tool 实现搜索
    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: KIMI_SEARCH_MODEL,
        messages: [
          {
            role: "system",
            content: "你是一个搜索助手。请使用 web_search 工具搜索相关信息，并返回搜索结果的标题、链接和摘要。只返回搜索结果，不要生成额外内容。",
          },
          {
            role: "user",
            content: `搜索：${query}`,
          },
        ],
        tools: [
          {
            type: "builtin_function",
            function: {
              name: "web_search",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "搜索关键词",
                  },
                  count: {
                    type: "number",
                    description: "返回结果数量",
                  },
                },
                required: ["query"],
              },
            },
          },
        ],
        tool_choice: "auto",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Kimi 搜索请求失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = normalizeResults(data);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "kimi",
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
      throw new Error("Kimi 搜索超时（15秒）");
    }
    throw e;
  }
}

function normalizeResults(data: Record<string, unknown>): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  // 从 chat completion 响应中提取搜索结果
  // 1. 尝试从 choices[0].message.tool_calls 中提取 web_search 结果
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (choices && choices.length > 0) {
    const message = choices[0].message as Record<string, unknown> | undefined;
    if (message) {
      // 从 tool_calls 中提取搜索结果
      const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
          const fn = tc.function as Record<string, unknown> | undefined;
          if (fn) {
            // Kimi web_search tool 返回的结果
            const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
            const searchResults = args?.results || args?.search_results || args?.web_search_results;
            if (Array.isArray(searchResults)) {
              for (const item of searchResults) {
                if (!item || typeof item !== "object") continue;
                const title = String(item.title || "").trim();
                const url = String(item.url || item.link || "").trim();
                const snippet = String(item.snippet || item.description || item.content || "").trim();
                if (title && url) {
                  results.push({ title, url, snippet });
                }
              }
            }
          }
        }
      }

      // 2. 如果没有 tool_calls 结果，从 content 中解析
      if (results.length === 0) {
        const content = String(message.content || "");
        if (content) {
          // 从回复内容中提取 Markdown 链接
          const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
          let match;
          while ((match = urlRegex.exec(content)) !== null) {
            results.push({
              title: match[1],
              url: match[2],
              snippet: undefined,
            });
          }

          // 备用：提取裸 URL
          if (results.length === 0) {
            const bareUrlRegex = /(https?:\/\/[^\s]+)/g;
            while ((match = bareUrlRegex.exec(content)) !== null) {
              results.push({
                title: match[1],
                url: match[1],
                snippet: undefined,
              });
            }
          }
        }
      }
    }
  }

  // 3. 尝试从顶层字段提取（兼容旧格式）
  if (results.length === 0) {
    const items = data.results || data.data || data.items;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const title = String(item.title || "").trim();
        const url = String(item.url || item.link || "").trim();
        const snippet = String(item.snippet || item.description || item.content || "").trim();
        if (title && url) {
          results.push({ title, url, snippet });
        }
      }
    }
  }

  return results;
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "kimi",
  label: "Kimi",
  hint: "Kimi 智能搜索",
  requiresCredential: true,
  credentialLabel: "API Key",
  envVars: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
  placeholder: "sk-...",
  signupUrl: "https://platform.moonshot.cn/",
  docsUrl: "https://platform.moonshot.cn/docs/",
  autoDetectOrder: 35,
  credentialPath: "tools.web.search.providers.kimi.apiKey",
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
      description: "使用 Kimi 智能搜索网页，由 Moonshot AI 提供支持。",
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

        return performSearch(apiKey!, query, count, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("kimi", plugin);

export default plugin;
