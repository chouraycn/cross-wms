/**
 * Link Metadata — 链接元数据管理
 *
 * 解析 OpenGraph、Twitter Card、JSON-LD 等结构化元数据。
 */

import * as cheerio from 'cheerio';
import { logger } from '../../logger.js';
import type { LinkMetadata } from './types.js';

/** 从 HTML 解析所有元数据 */
export function parseMetadataFromHtml(html: string): LinkMetadata {
  const $ = cheerio.load(html);
  const openGraph = parseOpenGraph($);
  const twitter = parseTwitterCard($);
  const jsonLd = parseJsonLd($);
  const standard = parseStandardMeta($);

  const hasAny = openGraph || twitter || jsonLd || standard;
  if (!hasAny) return {};

  const result: LinkMetadata = {};
  if (openGraph && Object.keys(openGraph).length > 0) result.openGraph = openGraph;
  if (twitter && Object.keys(twitter).length > 0) result.twitter = twitter;
  if (jsonLd && jsonLd.length > 0) result.jsonLd = jsonLd;
  if (standard && Object.keys(standard).length > 0) result.standard = standard;
  return result;
}

/** 解析 OpenGraph 标签（property="og:*"） */
export function parseOpenGraph($: cheerio.CheerioAPI): Record<string, string> {
  const result: Record<string, string> = {};
  $('meta[property]').each((_, elem) => {
    const property = $(elem).attr('property') || '';
    const content = $(elem).attr('content') || '';
    if (property.startsWith('og:') && content) {
      result[property] = content;
    }
  });
  return result;
}

/** 解析 Twitter Card 标签（name="twitter:*"） */
export function parseTwitterCard($: cheerio.CheerioAPI): Record<string, string> {
  const result: Record<string, string> = {};
  $('meta[name]').each((_, elem) => {
    const name = $(elem).attr('name') || '';
    const content = $(elem).attr('content') || '';
    if (name.startsWith('twitter:') && content) {
      result[name] = content;
    }
  });
  return result;
}

/** 解析 JSON-LD 结构化数据（type="application/ld+json"） */
export function parseJsonLd($: cheerio.CheerioAPI): unknown[] {
  const result: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, elem) => {
    const raw = $(elem).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // 每个 script 块对应一个元素，数组保持原样不展开
      result.push(parsed);
    } catch (e) {
      logger.debug(`[LinkMetadata] JSON-LD parse failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  return result;
}

/** 解析标准 meta 标签（name/content），并提取 <title> 标签 */
export function parseStandardMeta($: cheerio.CheerioAPI): Record<string, string> {
  const result: Record<string, string> = {};
  // 提取 <title> 标签内容作为 standard.title
  const title = $('title').first().text().trim();
  if (title) {
    result['title'] = title;
  }
  $('meta[name]').each((_, elem) => {
    const name = $(elem).attr('name') || '';
    const content = $(elem).attr('content') || '';
    // 跳过 twitter: 前缀（由 parseTwitterCard 处理）
    if (name && !name.startsWith('twitter:') && content) {
      result[name.toLowerCase()] = content;
    }
  });
  return result;
}

/** 从元数据中提取标题（优先级：og:title > twitter:title > standard.title） */
export function resolveTitle(metadata: LinkMetadata): string | undefined {
  return (
    metadata.openGraph?.['og:title'] ??
    metadata.twitter?.['twitter:title'] ??
    metadata.standard?.['title']
  );
}

/** 从元数据中提取描述 */
export function resolveDescription(metadata: LinkMetadata): string | undefined {
  return (
    metadata.openGraph?.['og:description'] ??
    metadata.twitter?.['twitter:description'] ??
    metadata.standard?.['description']
  );
}

/** 从元数据中提取预览图 */
export function resolveImage(metadata: LinkMetadata): string | undefined {
  return (
    metadata.openGraph?.['og:image'] ??
    metadata.twitter?.['twitter:image'] ??
    metadata.openGraph?.['og:image:url']
  );
}

/** 从元数据中提取站点名称 */
export function resolveSiteName(metadata: LinkMetadata): string | undefined {
  return metadata.openGraph?.['og:site_name'];
}

/** 从元数据推断卡片类型 */
export function resolveCardType(metadata: LinkMetadata): 'summary' | 'summary_large_image' | 'none' {
  const twitterCard = metadata.twitter?.['twitter:card'];
  if (twitterCard === 'summary_large_image') return 'summary_large_image';
  if (twitterCard === 'summary' || metadata.openGraph?.['og:title']) return 'summary';
  return 'none';
}
