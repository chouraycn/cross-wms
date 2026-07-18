/**
 * Link Preview — 链接预览生成
 *
 * 基于 OG 标签、Twitter Card 生成预览卡片信息。
 * 通过可注入的 fetchHtml 函数实现网络抓取，便于测试。
 */

import { logger } from '../../logger.js';
import {
  parseMetadataFromHtml,
  resolveCardType,
  resolveDescription,
  resolveImage,
  resolveSiteName,
  resolveTitle,
} from './metadata.js';
import { parseLinkInfo } from './extractor.js';
import type { LinkPreview } from './types.js';

/** 可注入的 HTML 抓取函数：返回 HTML 内容和最终 URL */
export type FetchHtmlFn = (
  url: string,
  opts?: { timeoutMs?: number },
) => Promise<{ html: string; finalUrl: string; contentType?: string }>;

export interface PreviewOptions {
  fetchHtml?: FetchHtmlFn;
  timeoutMs?: number;
}

/** 从 HTML 生成预览（不抓取网络，已有 HTML 时使用） */
export function buildPreviewFromHtml(
  url: string,
  html: string,
  opts?: { finalUrl?: string; contentType?: string },
): LinkPreview {
  const metadata = parseMetadataFromHtml(html);
  const title = resolveTitle(metadata);
  const description = resolveDescription(metadata);
  const image = resolveImage(metadata);
  const siteName = resolveSiteName(metadata);
  const cardType = resolveCardType(metadata);

  const info = parseLinkInfo(url);
  const icon = info?.domain ? `https://www.google.com/s2/favicons?domain=${info.domain}` : undefined;

  return {
    url,
    finalUrl: opts?.finalUrl,
    title,
    description,
    image,
    siteName: siteName ?? (info?.domain),
    icon,
    contentType: opts?.contentType,
    cardType: cardType === 'none' ? (title ? 'summary' : 'none') : cardType,
    metadata,
  };
}

/** 生成链接预览（抓取网络内容） */
export async function generatePreview(
  url: string,
  opts?: PreviewOptions,
): Promise<LinkPreview> {
  const fetchHtml = opts?.fetchHtml;
  if (!fetchHtml) {
    throw new Error('未配置 fetchHtml 函数，无法生成预览');
  }

  try {
    const { html, finalUrl, contentType } = await fetchHtml(url, { timeoutMs: opts?.timeoutMs });
    const preview = buildPreviewFromHtml(url, html, { finalUrl, contentType });
    logger.debug(`[LinkPreview] generated for ${url}: card=${preview.cardType}`);
    return preview;
  } catch (e) {
    logger.warn(`[LinkPreview] failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return buildFallbackPreview(url, e instanceof Error ? e.message : String(e));
  }
}

/** 抓取失败时的回退预览：仅包含基础 URL 信息 */
export function buildFallbackPreview(url: string, error?: string): LinkPreview {
  const info = parseLinkInfo(url);
  const icon = info?.domain ? `https://www.google.com/s2/favicons?domain=${info.domain}` : undefined;
  logger.debug(`[LinkPreview] fallback preview for ${url}: ${error ?? 'unknown'}`);
  return {
    url,
    title: info?.domain ?? url,
    siteName: info?.domain,
    icon,
    cardType: 'none',
  };
}

/** 批量生成预览 */
export async function generatePreviews(
  urls: string[],
  opts?: PreviewOptions,
): Promise<LinkPreview[]> {
  const results: LinkPreview[] = [];
  for (const url of urls) {
    const preview = await generatePreview(url, opts);
    results.push(preview);
  }
  return results;
}

/** 生成纯文本格式的预览摘要（用于聊天/CLI 展示） */
export function formatPreviewAsText(preview: LinkPreview): string {
  const lines: string[] = [];
  lines.push(`📎 ${preview.title ?? preview.siteName ?? preview.url}`);
  if (preview.description) {
    const desc = preview.description.length > 200
      ? preview.description.slice(0, 200) + '…'
      : preview.description;
    lines.push(`   ${desc}`);
  }
  lines.push(`   🔗 ${preview.finalUrl ?? preview.url}`);
  return lines.join('\n');
}
