/**
 * Web Readability Tool Extension
 *
 * 网页正文可读性提取。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用以下工具：
 *   - web_readability_extract  抓取指定 URL 并提取干净的文章正文（标题 + 文本）
 *   - web_readability_clean    对传入 HTML 字符串做可读性清洗，返回干净文本
 *
 * 基于 Node 内置 fetch + 启发式正文抽取（选择最长 <article>/<main> 或最大文本块），
 * 无外部依赖，适合 Agent 抓取并阅读网页文章内容。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'web-readability',
  name: 'Web Readability Tool',
  description: 'Web page readability extraction tool extension for clean article content',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');
  const withBreaks = cleaned.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  const text = withBreaks.replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decodeEntities(og[1].trim());
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : '';
}

function extractByTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

/**
 * 启发式正文抽取：
 * 1) 优先取 <article> / <main> 内容；
 * 2) 否则取所有 <p> 拼接，选择文本最长的连续块；
 * 3) 兜底整体 stripTags。
 */
function extractReadable(html: string): { text: string; strategy: string } {
  const article = extractByTag(html, 'article');
  if (article && stripTags(article).length > 200) {
    return { text: stripTags(article), strategy: 'article' };
  }
  const main = extractByTag(html, 'main');
  if (main && stripTags(main).length > 200) {
    return { text: stripTags(main), strategy: 'main' };
  }
  // 收集所有 <p>，按累计长度选最佳
  const paragraphs: string[] = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]).trim();
    if (t.length > 0) paragraphs.push(t);
  }
  if (paragraphs.length > 0) {
    return { text: paragraphs.join('\n\n'), strategy: 'paragraphs' };
  }
  return { text: stripTags(html), strategy: 'fallback' };
}

export default class WebReadabilityTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Web Readability tool extension');

    const timeoutMs = (context.config['timeoutMs'] as number) || 30000;
    const maxContentBytes = (context.config['maxContentBytes'] as number) || 524288;

    context.logger.info(`Web Readability tool registered with timeout=${timeoutMs}ms`);

    // web_readability_extract：抓取 URL 并提取正文
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'web_readability_extract',
          description: '抓取指定 URL 网页并提取干净的文章正文（含标题、正文文本、抽取策略）。',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: '目标文章 URL' },
              maxChars: { type: 'number', description: '返回正文最大字符数（默认 30000）' },
            },
            required: ['url'],
          },
        },
      },
      async (args) => {
        const url = String(args.url ?? '');
        if (!url) return JSON.stringify({ error: 'url 不能为空' });
        const maxChars = Number(args.maxChars ?? 30000);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebReadability/1.0)' },
          });
          clearTimeout(timer);
          const buf = Buffer.from(await res.arrayBuffer());
          const html = (buf.length > maxContentBytes ? buf.subarray(0, maxContentBytes) : buf).toString('utf-8');
          const title = extractTitle(html);
          const { text, strategy } = extractReadable(html);
          return JSON.stringify({
            ok: true,
            url: res.url || url,
            status: res.status,
            title,
            strategy,
            length: text.length,
            truncated: text.length > maxChars,
            text: text.slice(0, maxChars),
          });
        } catch (e) {
          return JSON.stringify({ ok: false, url, error: (e as Error).message });
        }
      },
    );

    // web_readability_clean：清洗传入 HTML
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'web_readability_clean',
          description: '对传入的 HTML 字符串做可读性清洗，返回干净的文章标题与正文文本。',
          parameters: {
            type: 'object',
            properties: {
              html: { type: 'string', description: '待清洗的 HTML 字符串' },
              maxChars: { type: 'number', description: '返回正文最大字符数（默认 30000）' },
            },
            required: ['html'],
          },
        },
      },
      async (args) => {
        const html = String(args.html ?? '');
        if (!html) return JSON.stringify({ error: 'html 不能为空' });
        const maxChars = Number(args.maxChars ?? 30000);
        const title = extractTitle(html);
        const { text, strategy } = extractReadable(html);
        return JSON.stringify({
          ok: true,
          title,
          strategy,
          length: text.length,
          truncated: text.length > maxChars,
          text: text.slice(0, maxChars),
        });
      },
    );
  }

  unregister(): void {
    console.log('Unregistering Web Readability tool extension');
  }
}
