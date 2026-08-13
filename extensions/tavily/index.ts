/**
 * Tavily Web Search Extension
 *
 * 需要 API key 的 AI 优化网页搜索。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用：
 *   - tavily_search  调用 Tavily Search API 搜索，返回标题/URL/摘要列表
 *
 * 需配置环境变量 TAVILY_API_KEY。未配置时工具调用返回友好提示。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'tavily',
  name: 'Tavily Web Search',
  description: 'Tavily AI-optimized web search provider extension',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export default class TavilyWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Tavily web search extension');

    const baseUrl = (context.config['baseUrl'] as string) || 'https://api.tavily.com';
    const timeoutMs = (context.config['timeoutMs'] as number) || 15000;

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'tavily_search',
          description: '使用 Tavily AI 优化搜索 API 搜索网页（需配置 TAVILY_API_KEY）。返回标题、URL、摘要列表。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' },
              count: { type: 'number', description: '返回结果数上限（默认 10）' },
            },
            required: ['query'],
          },
        },
      },
      async (args) => {
        const apiKey = context.secrets('TAVILY_API_KEY');
        if (!apiKey) {
          return JSON.stringify({
            ok: false,
            provider: 'tavily',
            error: '未配置 TAVILY_API_KEY，请在设置中填入 Tavily API Key',
          });
        }
        const query = String(args.query ?? '').trim();
        if (!query) return JSON.stringify({ error: 'query 不能为空' });
        const count = Math.min(Number(args.count ?? 10), 20);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(new URL('/search', baseUrl).toString(), {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              max_results: count,
              include_answer: false,
            }),
          });
          clearTimeout(timer);
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return JSON.stringify({ ok: false, provider: 'tavily', query, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
          }
          const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
          const results: SearchResult[] = (data.results || [])
            .slice(0, count)
            .map((r) => ({
              title: String(r.title || ''),
              url: String(r.url || ''),
              snippet: String(r.content || '').slice(0, 300),
            }))
            .filter((r) => r.url);
          return JSON.stringify({
            ok: true,
            provider: 'tavily',
            query,
            count: results.length,
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, provider: 'tavily', query, error: (e as Error).message });
        }
      },
    );

    context.logger.info('Tavily web search tool registered');
  }

  unregister(): void {
    console.log('Unregistering Tavily web search extension');
  }
}
