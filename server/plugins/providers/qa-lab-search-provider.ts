/**
 * QA-Lab Web Search Provider — QA 测试用模拟搜索 Provider
 *
 * 返回模拟数据，用于测试和开发，无需外部 API 调用。
 * 优先级最低，作为最后的 fallback 选项。
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
const CACHE_MAX_SIZE = 200;
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
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, { results, timestamp: Date.now() });
}

// ==================== 模拟数据生成 ====================

function generateMockResults(query: string, count: number): WebSearchResult[] {
  const templates = [
    {
      title: `${query} - 维基百科`,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      snippet: `${query}是一个广泛讨论的话题。本文介绍了${query}的基本概念、历史背景、发展现状以及未来趋势。`,
    },
    {
      title: `${query}入门教程 - 完整指南`,
      url: `https://example.com/tutorials/${encodeURIComponent(query)}`,
      snippet: `从零开始学习${query}，本教程包含详细的步骤说明、代码示例和实践练习，适合初学者和进阶开发者。`,
    },
    {
      title: `${query}最新资讯 - 2026年技术趋势`,
      url: `https://news.example.com/${encodeURIComponent(query)}-trends-2026`,
      snippet: `2026年${query}领域有哪些重大突破？本文汇总了最新的技术进展、行业动态和专家观点。`,
    },
    {
      title: `深度解析：${query}的工作原理`,
      url: `https://techblog.example.com/how-${encodeURIComponent(query)}-works`,
      snippet: `深入了解${query}的内部机制，包括核心架构、关键算法、性能优化等技术细节。`,
    },
    {
      title: `${query}常见问题解答 (FAQ)`,
      url: `https://faq.example.com/${encodeURIComponent(query)}`,
      snippet: `关于${query}的常见问题和解答，包括安装配置、使用技巧、故障排除等方面的内容。`,
    },
    {
      title: `${query}最佳实践 - 企业级应用`,
      url: `https://enterprise.example.com/${encodeURIComponent(query)}-best-practices`,
      snippet: `在企业环境中应用${query}的最佳实践，包括架构设计、安全策略、运维监控等方面的经验分享。`,
    },
    {
      title: `${query} vs 替代品 - 全面对比`,
      url: `https://compare.example.com/${encodeURIComponent(query)}-vs-alternatives`,
      snippet: `${query}与同类产品的详细对比分析，帮助您选择最适合的解决方案。`,
    },
    {
      title: `${query}社区论坛 - 开发者交流`,
      url: `https://forum.example.com/c/${encodeURIComponent(query)}`,
      snippet: `${query}开发者社区，分享经验、提问解答、参与讨论，与全球开发者一起成长。`,
    },
    {
      title: `${query}官方文档 - 最新版本`,
      url: `https://docs.example.com/${encodeURIComponent(query)}`,
      snippet: `${query}官方文档，包含完整的API参考、使用指南和示例代码，是学习和使用的权威资源。`,
    },
    {
      title: `${query}实战项目 - 开源合集`,
      url: `https://github.com/topics/${encodeURIComponent(query)}`,
      snippet: `精选${query}相关的开源项目，涵盖各种应用场景，助您快速上手和深入学习。`,
    },
  ];

  const results: WebSearchResult[] = [];
  for (let i = 0; i < Math.min(count, templates.length); i++) {
    results.push(templates[i]);
  }

  return results;
}

// ==================== 搜索执行 ====================

async function performSearch(
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
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 50);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });

    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);

    const results = generateMockResults(query, count);

    const resultList: WebSearchResultList = {
      query,
      results,
      count: results.length,
      provider: "qa-lab",
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
      throw new Error("QA Lab 搜索超时（10秒）");
    }
    throw e;
  }
}

// ==================== Provider 定义 ====================

const plugin: WebSearchProviderPlugin = {
  id: "qa-lab",
  label: "QA Lab",
  hint: "Testing mock search provider",
  requiresCredential: false,
  envVars: [],
  placeholder: "",
  signupUrl: "",
  docsUrl: "",
  autoDetectOrder: 200,
  credentialPath: "",
  inactiveSecretPaths: [],

  getCredentialValue(): unknown {
    return undefined;
  },

  setCredentialValue(): void {
    // no-op: QA Lab 不需要凭证
  },

  createTool(_ctx: WebSearchProviderContext): WebSearchProviderToolDefinition | null {
    return {
      description:
        "Mock search provider for QA testing and development. Returns simulated results without external API calls.",
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

        const count = Math.min(Number(args.count) || 8, 10);

        return performSearch(query, count, context?.signal);
      },
    };
  },
};

// ==================== 自动注册 ====================

registerWebSearchProvider("qa-lab", plugin);

export default plugin;
