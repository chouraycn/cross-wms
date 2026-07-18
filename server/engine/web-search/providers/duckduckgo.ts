/**
 * DuckDuckGo Search Provider — DuckDuckGo 搜索 Provider
 *
 * 隐私友好的搜索引擎，无需 API Key。
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

export function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const $ = cheerio.load(html);

  $('.result, .web-result').each((_, elem) => {
    if (results.length >= maxResults) return;

    const $elem = $(elem);
    const $link = $elem.find('a.result__a, a.result-title');
    if ($link.length === 0) return;

    const rawUrl = $link.attr('href') || '';
    if (!rawUrl || !rawUrl.startsWith('http')) return;

    const title = decodeHtmlEntities(stripTags($link.text()).trim());

    let snippet = '';
    const $snippet = $elem.find('.result__snippet, .result-snippet, .snippet');
    if ($snippet.length > 0) {
      snippet = decodeHtmlEntities(stripTags($snippet.first().text()).trim());
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({
        title,
        url: rawUrl,
        snippet: snippet || undefined,
        source: 'duckduckgo',
      });
    }
  });

  return results;
}

export function createDuckDuckGoProvider(
  options?: SearchProviderConstructorOptions,
): SearchProvider {
  const baseUrl = options?.baseUrl || 'https://html.duckduckgo.com';

  return {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    description: 'DuckDuckGo - 隐私友好的搜索引擎',
    isDomestic: false,
    supportsRegions: ['en-US', 'en-GB', 'zh-CN', 'ja-JP'],
    defaultPriority: 6,

    async search(
      query: SearchQuery,
      searchOptions?: SearchOptions,
    ): Promise<SearchResultList> {
      const startTime = Date.now();
      const maxResults = query.maxResults || 10;
      const encodedQuery = encodeURIComponent(query.query);
      let url = `${baseUrl}/html/?q=${encodedQuery}`;

      if (query.language) {
        url += `&kl=${query.language}`;
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
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (!response.ok) {
          throw new Error(`DuckDuckGo 搜索失败: HTTP ${response.status}`);
        }

        const html = await response.text();
        const results = parseDuckDuckGoHtml(html, maxResults);

        return {
          query: query.query,
          results: results.slice(0, maxResults),
          count: Math.min(results.length, maxResults),
          provider: 'duckduckgo',
          durationMs: Date.now() - startTime,
        };
      } catch (e) {
        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (e instanceof DOMException && e.name === 'AbortError') {
          if (searchOptions?.signal?.aborted) {
            throw e;
          }
          throw new Error('DuckDuckGo 搜索超时');
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
  id: 'duckduckgo',
  factory: createDuckDuckGoProvider,
  isDomestic: false,
  defaultPriority: 6,
});

export default createDuckDuckGoProvider;
