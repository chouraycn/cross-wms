/**
 * 360搜索 Provider（国内搜索引擎）
 * 
 * 无需 API Key，直接使用 HTML 搜索接口
 */

import { registerWebSearchProvider } from './web-search-providers.js';
import type { WebSearchProviderPlugin, WebSearchProviderContext, WebSearchResultList } from './web-provider-types.js';

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_TIMEOUT = 15000;

async function soSearch(
  params: { query: string; maxResults: number; timeoutMs?: number; userAgent?: string; signal?: AbortSignal },
): Promise<WebSearchResultList> {
  const { query, maxResults = DEFAULT_MAX_RESULTS, timeoutMs = DEFAULT_TIMEOUT, userAgent } = params;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://www.so.com/s?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`360搜索失败: HTTP ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ title: string; url: string; snippet?: string }> = [];

    const titleRegex = /<h3[^>]*><a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a><\/h3>/gi;
    let match;
    while ((match = titleRegex.exec(html)) !== null) {
      const href = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      
      if (title && href && href.startsWith('http')) {
        results.push({ title, url: href });
      }
    }

    return {
      query,
      results: results.slice(0, maxResults),
      count: Math.min(results.length, maxResults),
      provider: '360',
    };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export const soSearchProvider: WebSearchProviderPlugin = {
  id: '360',
  label: '360搜索',
  hint: '国内网络友好，无需 API Key',
  requiresCredential: false,
  envVars: [],
  placeholder: '',
  signupUrl: 'https://www.so.com',
  credentialPath: '',
  autoDetectOrder: 2,

  getCredentialValue: () => undefined,
  setCredentialValue: () => {},

  createTool: (): WebSearchProviderPlugin['createTool'] extends (...args: any[]) => infer R ? R : never => {
    return {
      description: '使用360搜索引擎搜索网页信息。国内网络友好，无需 API Key。',
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
        },
        required: ['query'],
      },
      execute: async (args: Record<string, unknown>): Promise<WebSearchResultList> => {
        const result = await soSearch({
          query: String(args.query || ''),
          maxResults: Number(args.maxResults || DEFAULT_MAX_RESULTS),
        });
        return result;
      },
    };
  },
};

registerWebSearchProvider('360', soSearchProvider);