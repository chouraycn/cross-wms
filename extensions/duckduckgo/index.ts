/**
 * DuckDuckGo Web Search Extension
 *
 * 无需 API key 的网页搜索。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用：
 *   - duckduckgo_search  使用 DuckDuckGo HTML 接口搜索，返回标题/URL/摘要列表
 *
 * 基于 DuckDuckGo Lite/HTML 接口，无外部依赖。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'duckduckgo',
  name: 'DuckDuckGo Web Search',
  description: 'DuckDuckGo web search provider extension (no API key required)',
  version: '1.0.0',
  kind: 'web-search',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** 从 DuckDuckGo HTML 响应中解析结果 */
function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // DuckDuckGo HTML 版结果块：<a class="result__a" href="...">title</a> + <a class="result__snippet">
  const blockRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const rawUrl = m[1];
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, '').trim());
    const snippet = decodeEntities((m[3] || '').replace(/<[^>]+>/g, '').trim());
    // DuckDuckGo 重定向链接格式：//duckduckgo.com/l/?uddg=<encoded>
    let url = rawUrl;
    const uddg = rawUrl.match(/uddg=([^&]+)/);
    if (uddg) {
      try { url = decodeURIComponent(uddg[1]); } catch { /* keep raw */ }
    }
    if (url.startsWith('//')) url = 'https:' + url;
    if (title && url) results.push({ title, url, snippet });
  }
  return results;
}

export default class DuckDuckGoWebSearch implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering DuckDuckGo web search extension');

    const baseUrl = (context.config['baseUrl'] as string) || 'https://html.duckduckgo.com/html';
    const timeoutMs = (context.config['timeoutMs'] as number) || 15000;

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'duckduckgo_search',
          description: '使用 DuckDuckGo 搜索网页（无需 API key）。返回标题、URL、摘要列表。',
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
        const query = String(args.query ?? '').trim();
        if (!query) return JSON.stringify({ error: 'query 不能为空' });
        const count = Math.min(Number(args.count ?? 10), 30);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(baseUrl, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (compatible; DuckDuckGoSearch/1.0)',
            },
            body: new URLSearchParams({ q: query, b: '' }).toString(),
          });
          clearTimeout(timer);
          const html = await res.text();
          const results = parseDuckDuckGoHtml(html).slice(0, count);
          return JSON.stringify({
            ok: true,
            provider: 'duckduckgo',
            query,
            count: results.length,
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, provider: 'duckduckgo', query, error: (e as Error).message });
        }
      },
    );

    context.logger.info('DuckDuckGo web search tool registered');
  }

  unregister(): void {
    console.log('Unregistering DuckDuckGo web search extension');
  }
}
