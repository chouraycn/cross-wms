/**
 * Content Extractors — 内容提取器
 *
 * 提供多种内容提取策略：正文提取、标题提取、元数据提取。
 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  ContentExtractRequest,
  ContentExtractResult,
  ContentExtractor,
} from './types.js';
import { logger } from '../../logger.js';

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxLength), truncated: true };
}

function extractWithReadability($: cheerio.CheerioAPI, maxLength: number): { content: string; title?: string } {
  const candidates: Array<{ score: number; element: cheerio.Cheerio<AnyNode>; text: string }> = [];

  $('article, main, #content, #main, .content, .article, .post, .entry, #post, .main-content').each(
    (_, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      const textLength = text.length;

      if (textLength < 200) return;

      let score = textLength;

      const paragraphs = $elem.find('p').length;
      score += paragraphs * 100;

      const links = $elem.find('a').length;
      const linkDensity = links / Math.max(textLength, 1);
      score -= linkDensity * 500;

      const classAndId = ($elem.attr('class') || '') + ' ' + ($elem.attr('id') || '');
      if (/article|content|main|post|entry|body/i.test(classAndId)) {
        score += 200;
      }
      if (/comment|footer|header|nav|sidebar|menu|advert|ad-|sponsor/i.test(classAndId)) {
        score -= 200;
      }

      candidates.push({ score, element: $elem, text });
    },
  );

  if (candidates.length === 0) {
    const bodyText = $('body').text().trim();
    return {
      content: bodyText.slice(0, maxLength),
      title: $('title').text().trim(),
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  let content = best.text;

  const title = $('title').text().trim() || $('h1').first().text().trim() || undefined;

  if (content.length > maxLength) {
    content = content.slice(0, maxLength);
  }

  return { content, title };
}

function extractMetaTags($: cheerio.CheerioAPI): Record<string, string> {
  const metadata: Record<string, string> = {};

  $('meta').each((_, elem) => {
    const $elem = $(elem);
    const name = $elem.attr('name') || $elem.attr('property') || '';
    const content = $elem.attr('content') || '';

    if (name && content) {
      metadata[name.toLowerCase()] = content;
    }
  });

  return metadata;
}

export const basicExtractor: ContentExtractor = {
  id: 'basic',
  name: '基础提取器',
  description: '基础 HTML 内容提取，支持标题、元数据和正文提取',
  priority: 1,

  supports(request: ContentExtractRequest): boolean {
    return !!request.html;
  },

  async extract(request: ContentExtractRequest): Promise<ContentExtractResult | null> {
    const { html, url, extractMode = 'text', maxLength = 100000, extractTitle = true, extractMetadata = true } = request;

    if (!html) {
      return null;
    }

    const $ = cheerio.load(html);
    let content = '';
    let title: string | undefined;
    let truncated = false;

    if (extractMode === 'html') {
      const bodyHtml = $('body').html() || html;
      const result = truncateText(bodyHtml, maxLength);
      content = result.text;
      truncated = result.truncated;
    } else {
      const extractionResult = extractWithReadability($, maxLength);
      content = extractionResult.content;
      title = extractionResult.title;
      truncated = content.length >= maxLength;

      if (extractMode === 'markdown') {
        content = htmlToMarkdown($, content, maxLength);
        if (content.length > maxLength) {
          content = content.slice(0, maxLength);
          truncated = true;
        }
      }
    }

    const metadata = extractMetadata ? extractMetaTags($) : undefined;

    if (extractTitle && !title) {
      title = $('title').text().trim() || $('h1').first().text().trim() || undefined;
    }

    content = decodeHtmlEntities(content);

    return {
      content,
      title,
      contentType: extractMode,
      contentLength: content.length,
      truncated,
      extractorId: 'basic',
      metadata,
    };
  },
};

function htmlToMarkdown($: cheerio.CheerioAPI, _content: string, _maxLength: number): string {
  let markdown = '';

  $('h1, h2, h3, h4, h5, h6').each((_, elem) => {
    const level = parseInt($(elem).prop('tagName')?.charAt(1) ?? '1');
    const text = $(elem).text().trim();
    if (text) {
      markdown += `${'#'.repeat(level)} ${text}\n\n`;
    }
  });

  $('p').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 20) {
      markdown += `${text}\n\n`;
    }
  });

  $('a').each((_, elem) => {
    const $elem = $(elem);
    const href = $elem.attr('href') || '';
    const text = $elem.text().trim();
    if (text && href && href.startsWith('http')) {
      markdown += `[${text}](${href})\n\n`;
    }
  });

  return markdown.trim();
}

export const titleExtractor: ContentExtractor = {
  id: 'title',
  name: '标题提取器',
  description: '仅提取网页标题',
  priority: 10,

  supports(request: ContentExtractRequest): boolean {
    return !!request.html;
  },

  async extract(request: ContentExtractRequest): Promise<ContentExtractResult | null> {
    const { html, extractMode = 'text' } = request;

    if (!html) {
      return null;
    }

    const $ = cheerio.load(html);

    let title = $('title').text().trim();
    if (!title) {
      title = $('h1').first().text().trim();
    }
    if (!title) {
      const ogTitle = $('meta[property="og:title"]').attr('content');
      title = ogTitle || '';
    }

    title = decodeHtmlEntities(title);

    if (!title) {
      return null;
    }

    return {
      content: title,
      title,
      contentType: extractMode,
      contentLength: title.length,
      truncated: false,
      extractorId: 'title',
    };
  },
};

export const metadataExtractor: ContentExtractor = {
  id: 'metadata',
  name: '元数据提取器',
  description: '提取网页元数据（description、keywords、og 标签等）',
  priority: 20,

  supports(request: ContentExtractRequest): boolean {
    return !!request.html;
  },

  async extract(request: ContentExtractRequest): Promise<ContentExtractResult | null> {
    const { html, extractMode = 'text' } = request;

    if (!html) {
      return null;
    }

    const $ = cheerio.load(html);
    const metadata = extractMetaTags($);

    if (Object.keys(metadata).length === 0) {
      return null;
    }

    const content = Object.entries(metadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return {
      content,
      title: metadata['title'] || metadata['og:title'],
      contentType: extractMode,
      contentLength: content.length,
      truncated: false,
      extractorId: 'metadata',
      metadata,
    };
  },
};

const extractors: ContentExtractor[] = [basicExtractor, titleExtractor, metadataExtractor];

export function getExtractors(): ContentExtractor[] {
  return [...extractors].sort((a, b) => a.priority - b.priority);
}

export function getExtractor(id: string): ContentExtractor | undefined {
  return extractors.find((e) => e.id === id);
}

export function registerExtractor(extractor: ContentExtractor): void {
  const existingIndex = extractors.findIndex((e) => e.id === extractor.id);
  if (existingIndex >= 0) {
    extractors[existingIndex] = extractor;
    logger.debug(`Updated content extractor: ${extractor.id}`);
  } else {
    extractors.push(extractor);
    logger.debug(`Registered content extractor: ${extractor.id}`);
  }
}

export function unregisterExtractor(id: string): boolean {
  const index = extractors.findIndex((e) => e.id === id);
  if (index >= 0) {
    extractors.splice(index, 1);
    logger.debug(`Unregistered content extractor: ${id}`);
    return true;
  }
  return false;
}

export function resetExtractors(): void {
  extractors.length = 0;
  extractors.push(basicExtractor, titleExtractor, metadataExtractor);
  logger.debug('Reset content extractors to default');
}

export async function extractContent(
  request: ContentExtractRequest,
): Promise<ContentExtractResult | null> {
  const sortedExtractors = getExtractors();

  for (const extractor of sortedExtractors) {
    try {
      if (await extractor.supports(request)) {
        logger.debug(`Using content extractor: ${extractor.id}`);
        const result = await extractor.extract(request);
        if (result) {
          return result;
        }
      }
    } catch (e) {
      logger.warn(`Content extractor '${extractor.id}' failed: ${e}`);
    }
  }

  return null;
}
