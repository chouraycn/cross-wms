/**
 * Exa Web Search Extension
 *
 * 需要 API key 的神经网页搜索。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用：
 *   - exa_search  调用 Exa (Metaphor) Search API 搜索，返回标题/URL/摘要列表
 *
 * 需配置环境变量 EXA_API_KEY。未配置时工具调用返回友好提示。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'exa',
  name: 'Exa Web Search',
  description: 'Exa (Metaphor) neural web search provider extension',
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

export default class ExaWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Exa web search extension');

    const baseUrl = (context.config['baseUrl'] as string) || 'https://api.exa.ai';
    const timeoutMs = (context.config['timeoutMs'] as number) || 15000;

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'exa_search',
          description: '使用 Exa (Metaphor) 神经搜索 API 搜索网页（需配置 EXA_API_KEY）。返回标题、URL、摘要列表。',
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
        const apiKey = context.secrets('EXA_API_KEY');
        if (!apiKey) {
          return JSON.stringify({
            ok: false,
            provider: 'exa',
            error: '未配置 EXA_API_KEY，请在设置中填入 Exa API Key',
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
              'x-api-key': apiKey,
            },
            body: JSON.stringify({
              query,
              numResults: count,
              contents: { text: { maxCharacters: 200 } },
            }),
          });
          clearTimeout(timer);
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return JSON.stringify({ ok: false, provider: 'exa', query, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
          }
          const data = await res.json() as { results?: Array<{ title?: string; url?: string; text?: string }> };
          const results: SearchResult[] = (data.results || [])
            .slice(0, count)
            .map((r) => ({
              title: String(r.title || ''),
              url: String(r.url || ''),
              snippet: String(r.text || '').slice(0, 300),
            }))
            .filter((r) => r.url);
          return JSON.stringify({
            ok: true,
            provider: 'exa',
            query,
            count: results.length,
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, provider: 'exa', query, error: (e as Error).message });
        }
      },
    );

    context.logger.info('Exa web search tool registered');
  }

  unregister(): void {
    console.log('Unregistering Exa web search extension');
  }
}
