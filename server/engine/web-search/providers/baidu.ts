/**
 * Baidu Search Provider — 百度搜索 Provider
 *
 * 支持 HTML 页面解析模式（免费，无需凭证）
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…');
}

function extractBaiduRedirectUrl(redirectUrl: string): string {
  try {
    const url = new URL(redirectUrl);
    const target = url.searchParams.get('url');
    if (target) {
      return target;
    }
  } catch {
    // ignore
  }
  return redirectUrl;
}

export function parseBaiduHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const $ = cheerio.load(html);

  $('.result').each((_, elem) => {
    if (results.length >= maxResults) return;

    const $elem = $(elem);
    const $h3 = $elem.find('h3');
    if ($h3.length === 0) return;

    const $link = $h3.find('a');
    if ($link.length === 0) return;

    let rawUrl = $link.attr('href') || '';
    if (!rawUrl) return;

    if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
    if (rawUrl.includes('baidu.com/link?url=') || rawUrl.includes('baidu.com/link?wd=')) {
      rawUrl = extractBaiduRedirectUrl(rawUrl);
    }

    const title = decodeHtmlEntities(stripTags($link.text()).trim());

    let snippet = '';
    const snippetSelectors = [
      '.c-abstract',
      '.content-right',
      '.c-span-last',
      '.abstract',
      '.c-gap-top-small',
      "div[class*='abstract']",
      "div[class*='content']",
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
      const $divs = $elem.find('div');
      let bestText = '';
      $divs.each((_, div) => {
        const text = decodeHtmlEntities(stripTags($(div).text()).trim());
        if (text.length > bestText.length && text.length < 300) {
          bestText = text;
        }
      });
      if (bestText.length > 10) {
        snippet = bestText;
      }
    }

    if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
      results.push({ title, url: rawUrl, snippet, source: 'baidu', language: 'zh' });
    }
  });

  if (results.length === 0) {
    $('h3').each((_, elem) => {
      if (results.length >= maxResults) return;
      const $h3 = $(elem);
      const $link = $h3.find('a');
      if ($link.length === 0) return;

      let rawUrl = $link.attr('href') || '';
      if (!rawUrl) return;

      if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
      if (rawUrl.includes('baidu.com/link?url=') || rawUrl.includes('baidu.com/link?wd=')) {
        rawUrl = extractBaiduRedirectUrl(rawUrl);
      }

      const title = decodeHtmlEntities(stripTags($link.text()).trim());

      if (title && rawUrl && !results.some((r) => r.url === rawUrl)) {
        results.push({ title, url: rawUrl, snippet: '', source: 'baidu', language: 'zh' });
      }
    });
  }

  return results;
}

async function fetchBaiduHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`百度搜索请求失败: HTTP ${response.status}`);
  }

  return response.text();
}

export function createBaiduProvider(
  options?: SearchProviderConstructorOptions,
): SearchProvider {
  const baseUrl = options?.baseUrl || 'https://www.baidu.com';

  return {
    id: 'baidu',
    name: '百度',
    description: '百度搜索 - 国内最大的中文搜索引擎',
    isDomestic: true,
    supportsRegions: ['zh-CN', 'zh-TW', 'zh-HK'],
    defaultPriority: 1,

    async search(
      query: SearchQuery,
      searchOptions?: SearchOptions,
    ): Promise<SearchResultList> {
      const startTime = Date.now();
      const maxResults = query.maxResults || 10;
      const encodedQuery = encodeURIComponent(query.query);
      let url = `${baseUrl}/s?wd=${encodedQuery}&rn=${Math.min(maxResults * 2, 50)}`;

      if (query.language === 'zh' || query.language === 'zh-CN') {
        url += '&ct=2097152';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), searchOptions?.timeoutMs || DEFAULT_TIMEOUT);

      const abortHandler = () => controller.abort();
      searchOptions?.signal?.addEventListener('abort', abortHandler);

      try {
        const html = await fetchBaiduHtml(url, controller.signal);
        const results = parseBaiduHtml(html, maxResults);

        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        return {
          query: query.query,
          results: results.slice(0, maxResults),
          count: Math.min(results.length, maxResults),
          provider: 'baidu',
          durationMs: Date.now() - startTime,
        };
      } catch (e) {
        clearTimeout(timeoutId);
        searchOptions?.signal?.removeEventListener('abort', abortHandler);

        if (e instanceof DOMException && e.name === 'AbortError') {
          if (searchOptions?.signal?.aborted) {
            throw e;
          }
          throw new Error('百度搜索超时');
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
  id: 'baidu',
  factory: createBaiduProvider,
  isDomestic: true,
  defaultPriority: 1,
});

export default createBaiduProvider;
