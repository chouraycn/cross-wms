/**
 * 硅基流动搜索 Provider（国内搜索引擎）
 * 
 * API 文档：https://www.siliconflow.cn/docs/api/search
 */

import { registerWebSearchProvider } from "../web-search-providers.js";
import type { WebSearchProviderPlugin, WebSearchResultList } from "../web-provider-types.js";

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_TIMEOUT = 10000;

async function siliconFlowSearch(
  apiKey: string,
  params: { query: string; maxResults: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<WebSearchResultList> {
  const { query, maxResults = DEFAULT_MAX_RESULTS, timeoutMs = DEFAULT_TIMEOUT } = params;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.siliconflow.cn/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        top_k: maxResults,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`硅基流动搜索失败: HTTP ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results: Array<{ title: string; url: string; snippet?: string }> = [];

    const items = (data.results as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      const title = String(item.title || item.name || '');
      const url = String(item.url || item.link || '');
      const snippet = item.snippet ? String(item.snippet) : undefined;
      
      if (title && url && url.startsWith('http')) {
        results.push({ title, url, snippet });
      }
    }

    return {
      query,
      results: results.slice(0, maxResults),
      count: Math.min(results.length, maxResults),
      provider: 'siliconflow',
    };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

const plugin: WebSearchProviderPlugin = {
  id: 'siliconflow',
  label: '硅基流动搜索',
  hint: '国内 AI 搜索，需要 API Key',
  requiresCredential: true,
  credentialLabel: 'API Key',
  envVars: ['SILICONFLOW_API_KEY'],
  placeholder: 'sk-...',
  signupUrl: 'https://www.siliconflow.cn/',
  docsUrl: 'https://www.siliconflow.cn/docs/api/search',
  credentialPath: 'tools.web.search.providers.siliconflow.apiKey',
  inactiveSecretPaths: [],
  autoDetectOrder: 3,

  getCredentialValue(searchConfig?: Record<string, unknown>): unknown {
    return searchConfig?.apiKey;
  },
  setCredentialValue(searchConfigTarget: Record<string, unknown>, value: unknown): void {
    searchConfigTarget.apiKey = value;
  },
  getConfiguredCredentialValue(config: Record<string, unknown>): unknown {
    return config.apiKey;
  },
  setConfiguredCredentialValue(configTarget: Record<string, unknown>, value: unknown): void {
    configTarget.apiKey = value;
  },

  createTool(ctx) {
    let apiKey: string | undefined;

    const configValue = ctx.searchConfig?.apiKey;
    if (configValue !== undefined && configValue !== null && configValue !== '') {
      apiKey = String(configValue);
    }

    if (!apiKey) {
      for (const envVar of ['SILICONFLOW_API_KEY']) {
        const envValue = process.env[envVar];
        if (envValue && envValue.trim() !== '') {
          apiKey = envValue.trim();
          break;
        }
      }
    }

    if (!apiKey) {
      return null;
    }

    return {
      description: '使用硅基流动搜索引擎搜索网页信息。国内 AI 搜索服务，搜索结果质量高。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
          maxResults: {
            type: 'number',
            description: `最大结果数（默认 ${DEFAULT_MAX_RESULTS}）`,
            default: DEFAULT_MAX_RESULTS,
          },
          timeoutMs: {
            type: 'number',
            description: '超时时间（毫秒）',
            default: DEFAULT_TIMEOUT,
          },
        },
        required: ['query'],
      },
      async execute(args, context) {
        return siliconFlowSearch(apiKey!, {
          query: String(args.query || ''),
          maxResults: Number(args.maxResults || DEFAULT_MAX_RESULTS),
          timeoutMs: Number(args.timeoutMs || DEFAULT_TIMEOUT),
          signal: context?.signal,
        });
      },
    };
  },
};

registerWebSearchProvider('siliconflow', plugin);
export default plugin;