/**
 * Bing Search Provider — 必应搜索 Provider
 *
 * 支持国内版和国际版必应搜索。
 */

import * as cheerio from 'cheerio';
import type {
  SearchProvider,
  SearchQuery,
  SearchOptions,
  SearchResultList,
  SearchResult,
  SearchProviderConstructorOptions,
} from '../types.js';
import { registerProvider } from '../provider-registry.js';

const DEFAULT_TIMEOUT = 15000;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseBingHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const $ = cheerio.load(html);

  $('li.b_algo').each((_, elem) => {
    if (results.length >= maxResults) return;

    const $elem = $(elem);
    const $h2 = $elem.find('h2');
    if ($h2.length === 0) return;

    const $link = $h2.find('a');
    if ($link.length === 0) return;

    const rawUrl = $link.attr('href') || '';
    if (!rawUrl || !rawUrl.startsWith('http')) return;

    const title = decodeHtmlEntities(stripTags($link.text()).trim());

    let snippet = '';
    const $snippet = $elem.find('.b_caption p, .b_snippet p, p');
    if ($snippet.length > 0) {
      snippet = decodeHtmlEntities(stripTags($snippet.first().text()).trim());
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({
        title,
        url: rawUrl,
        snippet: snippet || undefined,
        source: 'bing',
      });
    }
  });

  if (results.length === 0) {
    $('h2 a').each((_, elem) => {
      if (results.length >= maxResults) return;

      const $link = $(elem);
      const rawUrl = $link.attr('href') || '';
      if (!rawUrl || !rawUrl.startsWith('http')) return;

      const title = decodeHtmlEntities(stripTags($link.text()).trim());

      if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
        results.push({
          title,
          url: rawUrl,
          source: 'bing',
        });
      }
    });
  }

  return results;
}

export function createBingProvider(
  options?: SearchProviderConstructorOptions,
): SearchProvider {
  const baseUrl = options?.baseUrl || 'https://cn.bing.com';
  const isDomestic = baseUrl.includes('cn.bing.com');

  return {
    id: isDomestic ? 'bing-cn' : 'bing',
    name: isDomestic ? '必应国内版' : '必应国际版',
    description: isDomestic
      ? '必应国内版 - 国内网络友好，无需 API Key'
      : '必应国际版 - 全球搜索引擎',
    isDomestic,
    supportsRegions: isDomestic ? ['zh-CN'] : ['en-US', 'zh-CN', 'ja-JP', 'ko-KR'],
    defaultPriority: isDomestic ? 2 : 5,

    async search(
      query: SearchQuery,
      searchOptions?: SearchOptions,
    ): Promise<SearchResultList> {
      const startTime = Date.now();
      const maxResults = query.maxResults || 10;
      const encodedQuery = encodeURIComponent(query.query);
      let url = `${baseUrl}/search?q=${encodedQuery}&count=${Math.min(maxResults * 2, 50)}`;

      if (query.language) {
        url += `&setlang=${query.language}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        searchOptions?.timeoutMs || DEFAULT_TIMEOUT,
      );

      const abortHandler = () => controller.abort();
      searchOptions?.signal?.addEventListener('abort', abortHandler);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (!response.ok) {
          throw new Error(`必应搜索失败: HTTP ${response.status}`);
        }

        const html = await response.text();
        const results = parseBingHtml(html, maxResults);

        return {
          query: query.query,
          results: results.slice(0, maxResults),
          count: Math.min(results.length, maxResults),
          provider: isDomestic ? 'bing-cn' : 'bing',
          durationMs: Date.now() - startTime,
        };
      } catch (e) {
        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (e instanceof DOMException && e.name === 'AbortError') {
          if (searchOptions?.signal?.aborted) {
            throw e;
          }
          throw new Error('必应搜索超时');
        }
        throw e;
      }
    },

    isAvailable(): boolean {
      return true;
    },
  };
}

registerProvider({
  id: 'bing-cn',
  factory: () => createBingProvider({ baseUrl: 'https://cn.bing.com' }),
  isDomestic: true,
  defaultPriority: 2,
});

export default createBingProvider;
