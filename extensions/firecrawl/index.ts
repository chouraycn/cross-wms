/**
 * Firecrawl Web Search Extension
 *
 * 需要 API key 的网页搜索与爬取。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用：
 *   - firecrawl_search  调用 Firecrawl Search API 搜索，返回标题/URL/摘要列表
 *
 * 需配置环境变量 FIRECRAWL_API_KEY。未配置时工具调用返回友好提示。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'firecrawl',
  name: 'Firecrawl Web Search',
  description: 'Firecrawl web crawl and search provider extension',
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

export default class FirecrawlWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Firecrawl web search extension');

    const baseUrl = (context.config['baseUrl'] as string) || 'https://api.firecrawl.dev/v1';
    const timeoutMs = (context.config['timeoutMs'] as number) || 15000;

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'firecrawl_search',
          description: '使用 Firecrawl Search API 搜索网页（需配置 FIRECRAWL_API_KEY）。返回标题、URL、摘要列表。',
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
        const apiKey = context.secrets('FIRECRAWL_API_KEY');
        if (!apiKey) {
          return JSON.stringify({
            ok: false,
            provider: 'firecrawl',
            error: '未配置 FIRECRAWL_API_KEY，请在设置中填入 Firecrawl API Key',
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
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              query,
              limit: count,
              scrapeOptions: { formats: ['markdown'] },
            }),
          });
          clearTimeout(timer);
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return JSON.stringify({ ok: false, provider: 'firecrawl', query, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
          }
          const data = await res.json() as { data?: Array<{ title?: string; url?: string; markdown?: string; description?: string }> };
          const items = data.data || [];
          const results: SearchResult[] = items
            .slice(0, count)
            .map((r) => ({
              title: String(r.title || r.url || ''),
              url: String(r.url || ''),
              snippet: String(r.description || r.markdown || '').slice(0, 300),
            }))
            .filter((r) => r.url);
          return JSON.stringify({
            ok: true,
            provider: 'firecrawl',
            query,
            count: results.length,
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, provider: 'firecrawl', query, error: (e as Error).message });
        }
      },
    );

    context.logger.info('Firecrawl web search tool registered');
  }

  unregister(): void {
    console.log('Unregistering Firecrawl web search extension');
  }
}
