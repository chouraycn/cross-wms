/**
 * Google Search Provider — Google 搜索 Provider
 *
 * 国际搜索引擎，需要配置代理访问。
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

const DEFAULT_TIMEOUT = 20000;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function parseGoogleHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const $ = cheerio.load(html);

  $('div.g').each((_, elem) => {
    if (results.length >= maxResults) return;

    const $elem = $(elem);
    const $h3 = $elem.find('h3');
    if ($h3.length === 0) return;

    const $link = $elem.find('a[href]').first();
    if ($link.length === 0) return;

    let rawUrl = $link.attr('href') || '';
    if (!rawUrl) return;

    if (rawUrl.startsWith('/url?q=')) {
      const match = rawUrl.match(/\/url\?q=([^&]+)/);
      if (match) {
        rawUrl = decodeURIComponent(match[1]);
      }
    }

    if (!rawUrl.startsWith('http')) return;

    const title = decodeHtmlEntities(stripTags($h3.text()).trim());

    let snippet = '';
    const snippetSelectors = [
      '.VwiC3b',
      '.IsZvec',
      'div[data-sncf]',
      '.st',
    ];

    for (const sel of snippetSelectors) {
      const $snippet = $elem.find(sel);
      if ($snippet.length > 0) {
        const text = decodeHtmlEntities(stripTags($snippet.first().text()).trim());
        if (text.length > 10) {
          snippet = text;
          break;
        }
      }
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({
        title,
        url: rawUrl,
        snippet: snippet || undefined,
        source: 'google',
      });
    }
  });

  return results;
}

export function createGoogleProvider(
  options?: SearchProviderConstructorOptions,
): SearchProvider {
  const baseUrl = options?.baseUrl || 'https://www.google.com';

  return {
    id: 'google',
    name: 'Google',
    description: 'Google 搜索 - 全球最大的搜索引擎',
    isDomestic: false,
    supportsRegions: ['en-US', 'zh-CN', 'ja-JP', 'ko-KR', 'de-DE', 'fr-FR'],
    defaultPriority: 7,

    async search(
      query: SearchQuery,
      searchOptions?: SearchOptions,
    ): Promise<SearchResultList> {
      const startTime = Date.now();
      const maxResults = query.maxResults || 10;
      const encodedQuery = encodeURIComponent(query.query);
      let url = `${baseUrl}/search?q=${encodedQuery}&num=${Math.min(maxResults * 2, 50)}`;

      if (query.language) {
        url += `&hl=${query.language}&lr=lang_${query.language}`;
      }

      if (query.region) {
        url += `&gl=${query.region}`;
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
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (!response.ok) {
          throw new Error(`Google 搜索失败: HTTP ${response.status}`);
        }

        const html = await response.text();
        const results = parseGoogleHtml(html, maxResults);

        return {
          query: query.query,
          results: results.slice(0, maxResults),
          count: Math.min(results.length, maxResults),
          provider: 'google',
          durationMs: Date.now() - startTime,
        };
      } catch (e) {
        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (e instanceof DOMException && e.name === 'AbortError') {
          if (searchOptions?.signal?.aborted) {
            throw e;
          }
          throw new Error('Google 搜索超时');
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
  id: 'google',
  factory: createGoogleProvider,
  isDomestic: false,
  defaultPriority: 7,
});

export default createGoogleProvider;
