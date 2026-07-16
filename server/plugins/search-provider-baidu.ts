/**
 * 百度搜索 Provider（国内搜索引擎）
 * 
 * 无需 API Key，直接使用 HTML 搜索接口
 */

import { registerWebSearchProvider } from './web-search-providers.js';
import type { WebSearchProviderPlugin, WebSearchResultList } from './web-provider-types.js';

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_TIMEOUT = 15000;

async function baiduSearch(
  params: { query: string; maxResults: number; timeoutMs?: number; userAgent?: string; signal?: AbortSignal },
): Promise<WebSearchResultList> {
  const { query, maxResults = DEFAULT_MAX_RESULTS, timeoutMs = DEFAULT_TIMEOUT, userAgent } = params;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults * 2}`, {
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Cookie': 'BAIDUID=1234567890',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`百度搜索失败: HTTP ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ title: string; url: string; snippet?: string }> = [];

    const resultRegex = /<div class="result-op c-container xpath-log[^>]*>\s*<h3[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h3>[^>]*<span class="content-right_8Zs40">([\s\S]*?)<\/span>/gi;
    let match;
    while ((match = resultRegex.exec(html)) !== null) {
      const href = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const snippet = match[3]?.replace(/<[^>]+>/g, '').trim();
      
      if (title && href && href.startsWith('http')) {
        results.push({ title, url: href, snippet });
      }
    }

    if (results.length === 0) {
      const simpleRegex = /<h3[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi;
      while ((match = simpleRegex.exec(html)) !== null) {
        const href = match[1];
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        
        if (title && href && href.startsWith('http')) {
          results.push({ title, url: href });
        }
      }
    }

    return {
      query,
      results: results.slice(0, maxResults),
      count: Math.min(results.length, maxResults),
      provider: 'baidu',
    };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export const baiduSearchProvider: WebSearchProviderPlugin = {
  id: 'baidu',
  label: '百度搜索',
  hint: '国内网络友好，无需 API Key',
  requiresCredential: false,
  envVars: [],
  placeholder: '',
  signupUrl: 'https://www.baidu.com',
  credentialPath: '',
  autoDetectOrder: 0,

  getCredentialValue: () => undefined,
  setCredentialValue: () => {},

  createTool: (): WebSearchProviderPlugin['createTool'] extends (...args: any[]) => infer R ? R : never => {
    return {
      description: '使用百度搜索引擎搜索网页信息。国内网络友好，无需 API Key。',
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
      execute: async (args: Record<string, unknown>): Promise<WebSearchResultList> => {
        const result = await baiduSearch({
          query: String(args.query || ''),
          maxResults: Number(args.maxResults || DEFAULT_MAX_RESULTS),
          timeoutMs: Number(args.timeoutMs || DEFAULT_TIMEOUT),
        });
        return result;
      },
    };
  },
};

registerWebSearchProvider('baidu', baiduSearchProvider);