/**
 * Sogou Search Provider — 搜狗搜索 Provider
 *
 * 国内搜索引擎，支持 HTML 页面解析模式。
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

const DEFAULT_TIMEOUT = 10000;

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

export function parseSogouHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const $ = cheerio.load(html);

  $('.vrwrap, .rb, .result').each((_, elem) => {
    if (results.length >= maxResults) return;

    const $elem = $(elem);
    const $h3 = $elem.find('h3');
    if ($h3.length === 0) return;

    const $link = $h3.find('a');
    if ($link.length === 0) return;

    let rawUrl = $link.attr('href') || '';
    if (!rawUrl) return;

    if (rawUrl.startsWith('/link?url=')) {
      rawUrl = 'https://www.sogou.com' + rawUrl;
    }

    const title = decodeHtmlEntities(stripTags($link.text()).trim());

    let snippet = '';
    const snippetSelectors = [
      '.str_info',
      '.sogou-snapshot',
      '.ft',
      '.abstract',
      '.content',
      '.res-desc',
    ];

    for (const sel of snippetSelectors) {
      const $snippet = $elem.find(sel);
      if ($snippet.length > 0) {
        const text = decodeHtmlEntities(stripTags($snippet.text()).trim());
        if (text.length > 10) {
          snippet = text;
          break;
        }
      }
    }

    if (snippet.length < 10) {
      const $p = $elem.find('p');
      if ($p.length > 0) {
        const text = decodeHtmlEntities(stripTags($p.first().text()).trim());
        if (text.length > 10) {
          snippet = text;
        }
      }
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({
        title,
        url: rawUrl,
        snippet: snippet || undefined,
        source: 'sogou',
        language: 'zh',
      });
    }
  });

  if (results.length === 0) {
    $('h3 a').each((_, elem) => {
      if (results.length >= maxResults) return;

      const $link = $(elem);
      let rawUrl = $link.attr('href') || '';
      if (!rawUrl) return;

      if (rawUrl.startsWith('/link?url=')) {
        rawUrl = 'https://www.sogou.com' + rawUrl;
      }

      const title = decodeHtmlEntities(stripTags($link.text()).trim());

      if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
        results.push({
          title,
          url: rawUrl,
          source: 'sogou',
          language: 'zh',
        });
      }
    });
  }

  return results;
}

export function createSogouProvider(
  options?: SearchProviderConstructorOptions,
): SearchProvider {
  const baseUrl = options?.baseUrl || 'https://www.sogou.com';

  return {
    id: 'sogou',
    name: '搜狗',
    description: '搜狗搜索 - 国内搜索引擎',
    isDomestic: true,
    supportsRegions: ['zh-CN'],
    defaultPriority: 3,

    async search(
      query: SearchQuery,
      searchOptions?: SearchOptions,
    ): Promise<SearchResultList> {
      const startTime = Date.now();
      const maxResults = query.maxResults || 10;
      const encodedQuery = encodeURIComponent(query.query);
      const url = `${baseUrl}/web?query=${encodedQuery}&num=${Math.min(maxResults * 2, 50)}`;

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
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (!response.ok) {
          throw new Error(`搜狗搜索失败: HTTP ${response.status}`);
        }

        const html = await response.text();
        const results = parseSogouHtml(html, maxResults);

        return {
          query: query.query,
          results: results.slice(0, maxResults),
          count: Math.min(results.length, maxResults),
          provider: 'sogou',
          durationMs: Date.now() - startTime,
        };
      } catch (e) {
        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (e instanceof DOMException && e.name === 'AbortError') {
          if (searchOptions?.signal?.aborted) {
            throw e;
          }
          throw new Error('搜狗搜索超时');
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
  id: 'sogou',
  factory: createSogouProvider,
  isDomestic: true,
  defaultPriority: 3,
});

export default createSogouProvider;
