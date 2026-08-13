/**
 * Browser Tool Extension
 *
 * 浏览器自动化工具（基于 fetch 的页面抓取与快照，无需 Chrome 二进制即可真实可用）。
 * 通过 ExtensionBridge 注册真实可调用工具，Agent 启用本扩展后即可调用以下工具：
 *   - browser_navigate    抓取指定 URL，返回状态码、响应头、标题与正文文本快照
 *   - browser_get_text    从指定 URL 提取干净正文文本
 *   - browser_get_links   从指定 URL 提取页面链接列表
 *
 * 注：本实现使用 Node 内置 fetch，不依赖外部 Chrome/Playwright，适合无头环境下的
 * 轻量页面抓取。如需完整 CDP 自动化，可后续接入真实 Chrome。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'browser',
  name: 'Browser Tool',
  description: 'Browser automation tool extension (CDP / Playwright snapshot-and-act)',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

function stripTags(html: string): string {
  // 移除 script/style 内容
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  // 块级元素转换行
  const withBreaks = cleaned.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  // 去标签
  const text = withBreaks.replace(/<[^>]+>/g, '');
  // 解码常见实体
  const decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return decoded
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

function extractLinks(baseUrl: string, html: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  try {
    const base = new URL(baseUrl);
    while ((m = re.exec(html)) !== null) {
      const href = m[1].trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      let abs: string;
      try {
        abs = new URL(href, base).href;
      } catch {
        continue;
      }
      const text = stripTags(m[2]).slice(0, 120);
      links.push({ href: abs, text });
    }
  } catch {
    // 无效 baseUrl，返回原始 href
    while ((m = re.exec(html)) !== null) {
      links.push({ href: m[1].trim(), text: stripTags(m[2]).slice(0, 120) });
    }
  }
  return links;
}

export default class BrowserTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Browser tool extension');

    const cfg = context.config as Record<string, unknown>;
    const timeoutMs = (cfg['timeoutMs'] as number) || 30000;
    const maxBytes = (cfg['maxBytes'] as number) || 2 * 1024 * 1024;

    context.logger.info(`Browser tool registered with timeout=${timeoutMs}ms`);

    // browser_navigate：抓取页面快照
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'browser_navigate',
          description: '抓取指定 URL 页面，返回 HTTP 状态、响应头、页面标题与正文文本快照（截断）。',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: '目标 URL（http/https）' },
            },
            required: ['url'],
          },
        },
      },
      async (args) => {
        const url = String(args.url ?? '');
        if (!url) return JSON.stringify({ error: 'url 不能为空' });
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrowserTool/1.0)' },
          });
          clearTimeout(timer);
          const contentType = res.headers.get('content-type') || '';
          const buf = Buffer.from(await res.arrayBuffer());
          const truncated = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
          const html = truncated.toString('utf-8');
          const text = stripTags(html);
          const title = extractTitle(html);
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => { headers[k] = v; });
          return JSON.stringify({
            ok: true,
            url: res.url || url,
            status: res.status,
            statusText: res.statusText,
            contentType,
            title,
            headers,
            textLength: text.length,
            text: text.slice(0, 4000),
            truncated: buf.length > maxBytes,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, url, error: (e as Error).message });
        }
      },
    );

    // browser_get_text：提取干净正文
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'browser_get_text',
          description: '从指定 URL 提取干净的页面正文文本（去标签、去脚本）。',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: '目标 URL' },
              maxChars: { type: 'number', description: '返回文本最大字符数（默认 20000）' },
            },
            required: ['url'],
          },
        },
      },
      async (args) => {
        const url = String(args.url ?? '');
        if (!url) return JSON.stringify({ error: 'url 不能为空' });
        const maxChars = Number(args.maxChars ?? 20000);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrowserTool/1.0)' },
          });
          clearTimeout(timer);
          const buf = Buffer.from(await res.arrayBuffer());
          const html = (buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf).toString('utf-8');
          const text = stripTags(html);
          return JSON.stringify({
            ok: true,
            url: res.url || url,
            status: res.status,
            title: extractTitle(html),
            length: text.length,
            text: text.slice(0, maxChars),
            truncated: text.length > maxChars,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, url, error: (e as Error).message });
        }
      },
    );

    // browser_get_links：提取页面链接
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'browser_get_links',
          description: '从指定 URL 提取页面中的超链接列表（含绝对地址与锚文本）。',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: '目标 URL' },
              limit: { type: 'number', description: '返回链接数上限（默认 50）' },
            },
            required: ['url'],
          },
        },
      },
      async (args) => {
        const url = String(args.url ?? '');
        if (!url) return JSON.stringify({ error: 'url 不能为空' });
        const limit = Number(args.limit ?? 50);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrowserTool/1.0)' },
          });
          clearTimeout(timer);
          const buf = Buffer.from(await res.arrayBuffer());
          const html = (buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf).toString('utf-8');
          const links = extractLinks(res.url || url, html).slice(0, limit);
          return JSON.stringify({ ok: true, url: res.url || url, status: res.status, count: links.length, links });
        } catch (e) {
          return JSON.stringify({ ok: false, url, error: (e as Error).message });
        }
      },
    );
  }

  unregister(): void {
    console.log('Unregistering Browser tool extension');
  }
}
