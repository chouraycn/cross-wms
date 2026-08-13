/**
 * Brave Web Search Extension
 *
 * 需要 API key 的网页搜索。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用：
 *   - brave_search  调用 Brave Search API 搜索，返回标题/URL/摘要列表
 *
 * 需配置环境变量 BRAVE_API_KEY。未配置时工具调用返回友好提示。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'brave',
  name: 'Brave Web Search',
  description: 'Brave Search provider plugin for web search',
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

export default class BraveWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Brave web search extension');

    const baseUrl = (context.config['baseUrl'] as string) || 'https://api.search.brave.com';
    const timeoutMs = (context.config['timeoutMs'] as number) || 15000;

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'brave_search',
          description: '使用 Brave Search API 搜索网页（需配置 BRAVE_API_KEY）。返回标题、URL、摘要列表。',
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
        const apiKey = context.secrets('BRAVE_API_KEY');
        if (!apiKey) {
          return JSON.stringify({
            ok: false,
            provider: 'brave',
            error: '未配置 BRAVE_API_KEY，请在设置中填入 Brave Search API Key',
          });
        }
        const query = String(args.query ?? '').trim();
        if (!query) return JSON.stringify({ error: 'query 不能为空' });
        const count = Math.min(Number(args.count ?? 10), 20);
        try {
          const url = new URL('/res/v1/web/search', baseUrl);
          url.searchParams.set('q', query);
          url.searchParams.set('count', String(count));
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
              'X-Subscription-Token': apiKey,
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
            },
          });
          clearTimeout(timer);
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return JSON.stringify({ ok: false, provider: 'brave', query, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
          }
          const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
          const results: SearchResult[] = (data.web?.results || [])
            .slice(0, count)
            .map((r) => ({
              title: String(r.title || ''),
              url: String(r.url || ''),
              snippet: String(r.description || ''),
            }))
            .filter((r) => r.url);
          return JSON.stringify({
            ok: true,
            provider: 'brave',
            query,
            count: results.length,
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, provider: 'brave', query, error: (e as Error).message });
        }
      },
    );

    context.logger.info('Brave web search tool registered');
  }

  unregister(): void {
    console.log('Unregistering Brave web search extension');
  }
}
