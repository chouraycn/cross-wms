/**
 * SearXNG Web Search Extension
 *
 * 自托管 SearXNG 元搜索引擎。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用：
 *   - searxng_search  调用 SearXNG 实例的 JSON API 搜索，返回标题/URL/摘要列表
 *
 * 需在扩展配置中设置 baseUrl 指向自托管 SearXNG 实例（默认 http://localhost:8080）。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'searxng',
  name: 'SearXNG Web Search',
  description: 'SearXNG self-hosted meta search provider extension (no API key required)',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
}

export default class SearxngWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering SearXNG web search extension');

    const baseUrl = (context.config['baseUrl'] as string) || 'http://localhost:8080';
    const timeoutMs = (context.config['timeoutMs'] as number) || 15000;
    const defaultEngines = (context.config['engines'] as string) || '';

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'searxng_search',
          description: '使用自托管 SearXNG 实例搜索网页（无需 API key，需配置实例地址）。返回标题、URL、摘要列表。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' },
              count: { type: 'number', description: '返回结果数上限（默认 10）' },
              engines: { type: 'string', description: '指定搜索引擎（逗号分隔，如 google,bing），可选' },
            },
            required: ['query'],
          },
        },
      },
      async (args) => {
        const query = String(args.query ?? '').trim();
        if (!query) return JSON.stringify({ error: 'query 不能为空' });
        const count = Math.min(Number(args.count ?? 10), 30);
        const engines = String(args.engines ?? defaultEngines);
        try {
          const url = new URL('/search', baseUrl);
          url.searchParams.set('q', query);
          url.searchParams.set('format', 'json');
          if (engines) url.searchParams.set('engines', engines);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url.toString(), {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SearXngSearch/1.0)' },
          });
          clearTimeout(timer);
          if (!res.ok) {
            return JSON.stringify({ ok: false, provider: 'searxng', query, error: `HTTP ${res.status}` });
          }
          const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string; engine?: string }> };
          const results: SearchResult[] = (data.results || [])
            .slice(0, count)
            .map((r) => ({
              title: String(r.title || ''),
              url: String(r.url || ''),
              snippet: String(r.content || ''),
              engine: r.engine,
            }))
            .filter((r) => r.url);
          return JSON.stringify({
            ok: true,
            provider: 'searxng',
            query,
            count: results.length,
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, provider: 'searxng', query, error: (e as Error).message });
        }
      },
    );

    context.logger.info('SearXNG web search tool registered with baseUrl:', baseUrl);
  }

  unregister(): void {
    console.log('Unregistering SearXNG web search extension');
  }
}
