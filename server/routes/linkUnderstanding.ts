/**
 * Link Understanding REST API — 链接理解路由
 *
 * 把 server/engine/link-understanding 的提取、预览、安全检查能力通过 HTTP 暴露。
 *
 * 端点：
 * - POST /api/link-understanding/extract      — 从 URL 提取内容
 * - POST /api/link-understanding/preview      — 生成链接预览卡片
 * - POST /api/link-understanding/summarize    — 总结链接内容
 * - GET  /api/link-understanding/capabilities — 支持的能力
 */

import { Router, type Request, type Response } from 'express';
import {
  parseLinkInfo,
  generatePreview,
  buildPreviewFromHtml,
  buildFallbackPreview,
  createLinkSafetyChecker,
  defaultSafetyChecker,
  formatPreviewAsText,
} from '../engine/link-understanding/index.js';
import type { LinkPreview, LinkSafetyResult } from '../engine/link-understanding/index.js';
import { logger } from '../logger.js';

const router = Router();

/** 从 URL 抓取 HTML 内容 */
async function fetchHtml(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<{ html: string; finalUrl: string; contentType?: string }> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CrossWmsLinkUnderstanding/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`抓取失败: HTTP ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type') || undefined;
    const html = await res.text();
    const finalUrl = res.url || url;
    return { html, finalUrl, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** 从 HTML 中提取纯文本摘要（简单实现） */
function extractMainText(html: string, maxLength = 5000): string {
  // 移除 script/style 标签及内容
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    // 移除所有 HTML 标签
    .replace(/<[^>]+>/g, ' ')
    // 解码常见 HTML 实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 压缩空白
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '…';
  }
  return text;
}

/** 从 HTML 中提取图片 URL 列表 */
function extractImages(html: string, baseUrl: string, max = 10): string[] {
  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null && images.length < max) {
    const src = match[1];
    if (!src) continue;
    // 解析相对 URL
    try {
      const absolute = new URL(src, baseUrl).href;
      // 过滤 data URL 和过小的占位图
      if (!absolute.startsWith('data:')) {
        images.push(absolute);
      }
    } catch {
      // 忽略无效 URL
    }
  }
  return images;
}

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, message: string, status = 500): void {
  res.status(status).json({ success: false, error: message });
}

/**
 * POST /api/link-understanding/extract
 * 从 URL 提取内容
 *
 * Body: { url, options? }
 * 返回：标题、描述、主要内容、图片列表、元数据
 */
router.post('/extract', async (req: Request, res: Response) => {
  try {
    const { url, options } = req.body || {};
    if (!url || typeof url !== 'string') {
      return fail(res, 'url 为必填项', 400);
    }

    const info = parseLinkInfo(url);
    if (!info) {
      return fail(res, '无效的 URL', 400);
    }

    // 安全检查
    const safetyCheck = options?.safetyCheck !== false;
    let safety: LinkSafetyResult | undefined;
    if (safetyCheck) {
      const checker = options?.safetyChecker
        ? createLinkSafetyChecker(options.safetyChecker)
        : defaultSafetyChecker;
      safety = checker.check(url);
      // 高风险链接拒绝抓取
      if (safety.riskLevel === 'critical' || safety.riskLevel === 'high') {
        return ok(res, {
          url,
          linkInfo: info,
          safety,
          title: undefined,
          description: undefined,
          mainContent: undefined,
          images: [],
          metadata: undefined,
          note: '链接存在高风险，已拒绝抓取',
        });
      }
    }

    // 抓取内容
    const timeoutMs = options?.timeoutMs ?? 30_000;
    let html: string;
    let finalUrl: string;
    let contentType: string | undefined;
    try {
      const fetched = await fetchHtml(url, { timeoutMs });
      html = fetched.html;
      finalUrl = fetched.finalUrl;
      contentType = fetched.contentType;
    } catch (e) {
      logger.warn(`[link-understanding] 抓取失败: ${e instanceof Error ? e.message : String(e)}`);
      const fallback = buildFallbackPreview(url, e instanceof Error ? e.message : String(e));
      return ok(res, {
        url,
        linkInfo: info,
        safety,
        title: fallback.title,
        description: undefined,
        mainContent: undefined,
        images: [],
        metadata: fallback.metadata,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // 生成预览（含元数据解析）
    const preview: LinkPreview = buildPreviewFromHtml(url, html, { finalUrl, contentType });
    const mainContent = extractMainText(html, options?.maxLength ?? 5000);
    const images = extractImages(html, finalUrl, options?.maxImages ?? 10);

    return ok(res, {
      url,
      finalUrl,
      linkInfo: info,
      safety,
      title: preview.title,
      description: preview.description,
      mainContent,
      images,
      metadata: preview.metadata,
      contentType: preview.contentType,
    });
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * POST /api/link-understanding/preview
 * 生成链接预览卡片
 *
 * Body: { url, options? }
 */
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { url, options } = req.body || {};
    if (!url || typeof url !== 'string') {
      return fail(res, 'url 为必填项', 400);
    }

    const preview = await generatePreview(url, {
      fetchHtml,
      timeoutMs: options?.timeoutMs ?? 30_000,
    });

    // 安全检查（仅用于展示，不阻塞）
    const safety = options?.safetyCheck !== false
      ? defaultSafetyChecker.check(url)
      : undefined;

    return ok(res, { preview, safety, textPreview: formatPreviewAsText(preview) });
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * POST /api/link-understanding/summarize
 * 总结链接内容
 *
 * Body: { url, options? }
 * 返回：标题、描述、主要内容摘要
 */
router.post('/summarize', async (req: Request, res: Response) => {
  try {
    const { url, options } = req.body || {};
    if (!url || typeof url !== 'string') {
      return fail(res, 'url 为必填项', 400);
    }

    const info = parseLinkInfo(url);
    if (!info) {
      return fail(res, '无效的 URL', 400);
    }

    // 安全检查
    const safety = options?.safetyCheck !== false
      ? defaultSafetyChecker.check(url)
      : undefined;
    if (safety && (safety.riskLevel === 'critical' || safety.riskLevel === 'high')) {
      return ok(res, {
        url,
        title: undefined,
        description: undefined,
        summary: '链接存在高风险，已拒绝抓取',
        safety,
      });
    }

    // 抓取并生成预览
    const timeoutMs = options?.timeoutMs ?? 30_000;
    let html: string;
    let finalUrl: string;
    try {
      const fetched = await fetchHtml(url, { timeoutMs });
      html = fetched.html;
      finalUrl = fetched.finalUrl;
    } catch (e) {
      const fallback = buildFallbackPreview(url, e instanceof Error ? e.message : String(e));
      return ok(res, {
        url,
        title: fallback.title,
        description: undefined,
        summary: `抓取失败: ${e instanceof Error ? e.message : String(e)}`,
        safety,
      });
    }

    const preview = buildPreviewFromHtml(url, html, { finalUrl });
    const fullText = extractMainText(html, options?.maxLength ?? 8000);

    // 简单摘要：取前 N 个字符
    const summaryLength = options?.summaryLength ?? 500;
    const summary = fullText.length > summaryLength
      ? fullText.slice(0, summaryLength) + '…'
      : fullText;

    return ok(res, {
      url,
      finalUrl,
      title: preview.title,
      description: preview.description,
      summary,
      safety,
    });
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * GET /api/link-understanding/capabilities
 * 支持的能力
 */
router.get('/capabilities', (_req: Request, res: Response) => {
  return ok(res, {
    endpoints: [
      { path: '/extract', method: 'POST', desc: '从 URL 提取内容（标题、描述、正文、图片、元数据）' },
      { path: '/preview', method: 'POST', desc: '生成链接预览卡片' },
      { path: '/summarize', method: 'POST', desc: '总结链接内容' },
      { path: '/capabilities', method: 'GET', desc: '能力列表' },
    ],
    features: [
      'OpenGraph / Twitter Card / JSON-LD 元数据解析',
      'SSRF 防护与安全检查',
      '正文提取与图片列表',
      '链接预览卡片生成',
      '内容摘要',
    ],
    safetyChecks: ['ssrf', 'phishing', 'malware', 'suspicious-tld', 'ip-host', 'private-network', 'credentials-in-url', 'non-http'],
    note: '高/严重风险链接将拒绝抓取内容。',
  });
});

export default router;
