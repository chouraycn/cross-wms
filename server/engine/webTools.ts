/**
 * Web Tools — 互联网访问工具
 *
 * v2.4.0: 新增三个 Web 工具
 * - web_search: DuckDuckGo 搜索，返回结构化结果
 * - web_fetch:  抓取网页并 HTML→Markdown 转换
 * - web_api_call: 封装的 REST API 调用（域名白名单）
 *
 * v3.1: 三个工具均支持 renderJs 参数
 * - renderJs=true 时通过 Playwright 渲染 JS 动态页面
 * - Playwright 不可用时自动降级到原生 fetch
 */

// ===================== 域名白名单（web_api_call） =====================
// v3.0: 域名白名单改为 DB 加载 + 30s 内存缓存 + fallback 硬编码
// 具体实现在 server/dao/apiDomainWhitelist.ts
import { isDomainAllowed } from '../dao/apiDomainWhitelist.js';

// ===================== HTML → Markdown 轻量转换 =====================

/** 去除 HTML 标签但保留文本内容 */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/** 将 HTML 转换为 Markdown（轻量实现，不依赖第三方库） */
function htmlToMarkdown(html: string): string {
  let md = html;

  // 1. 去除不需要的内容块
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  md = md.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  md = md.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  md = md.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

  // 2. 标题 h1-h4
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n\n# ${stripTags(c)}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n\n## ${stripTags(c)}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n\n### ${stripTags(c)}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n\n#### ${stripTags(c)}\n\n`);

  // 3. 粗体 / 斜体
  md = md.replace(/<\/?(?:strong|b)[^>]*>/gi, '**');
  md = md.replace(/<\/?(?:em|i)[^>]*>/gi, '*');

  // 4. 链接
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // 5. 行内代码 & 代码块
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${c}\n\`\`\`\n\n`);
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${stripTags(c)}\n\`\`\`\n\n`);

  // 6. 列表项
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `\n- ${stripTags(c)}`);

  // 7. 段落
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, c) => `\n\n${stripTags(c)}\n\n`);

  // 8. 换行
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // 9. 去除所有剩余 HTML 标签
  md = stripTags(md);

  // 10. 解码 HTML 实体
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');

  // 11. 压缩多余空行
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

// ===================== JS 渲染辅助 =====================

/**
 * 动态导入 renderContent（Playwright 可能未安装）
 * 返回 null 表示不可用
 */
async function tryRenderContent(url: string, selector?: string): Promise<{
  html: string;
  title: string;
  finalUrl: string;
} | null> {
  try {
    const { renderContent } = await import('../services/browserHostClient.js');
    const result = await renderContent({ url, waitUntil: 'networkidle', selector, timeout: 20000 });
    if (result.ok && result.html) {
      return { html: result.html, title: result.title || '', finalUrl: result.url || url };
    }
    return null;
  } catch {
    // Playwright 未安装或 BrowserHost 不可用
    return null;
  }
}

// ===================== Handler: web_search =====================

export async function handleWebSearch(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || '').trim();
  if (!query) {
    return JSON.stringify({ success: false, error: '搜索关键词不能为空' });
  }

  const maxResults = Math.min(Number(args.maxResults) || 8, 20);
  const renderJs = args.renderJs === true;

  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    let html: string;

    if (renderJs) {
      // 使用 Playwright 渲染搜索结果页
      const rendered = await tryRenderContent(url);
      if (rendered) {
        html = rendered.html;
      } else {
        // 降级到原生 fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'CrossWMS-AI/1.0', 'Accept': 'text/html' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          return JSON.stringify({ success: false, error: `搜索请求失败: HTTP ${response.status}` });
        }
        html = await response.text();
      }
    } else {
      // 原生 fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'CrossWMS-AI/1.0', 'Accept': 'text/html' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        return JSON.stringify({ success: false, error: `搜索请求失败: HTTP ${response.status}` });
      }
      html = await response.text();
    }

    // 解析 DuckDuckGo HTML 搜索结果
    const results: Array<{ title: string; snippet: string; url: string }> = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    // 先匹配所有结果链接
    const linkMatches = [...html.matchAll(linkRegex)];

    // 再匹配所有 snippet
    const snippetMatches = [...html.matchAll(snippetRegex)];

    for (let i = 0; i < Math.min(linkMatches.length, maxResults); i++) {
      const linkMatch = linkMatches[i];
      let rawUrl = linkMatch[1];
      // DuckDuckGo 的 URL 格式为 //duckduckgo.com/l/?uddg=...&rut=...
      if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
      const title = stripTags(linkMatch[2]).trim();
      const snippet = snippetMatches[i]
        ? stripTags(snippetMatches[i][1]).trim().substring(0, 200)
        : '';

      if (title) {
        results.push({ title, snippet, url: rawUrl });
      }
    }

    // 如果上述正则没匹配到（DDG 可能改版），尝试备选解析
    if (results.length === 0) {
      const altRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const altMatches = [...html.matchAll(altRegex)];
      for (let i = 0; i < Math.min(altMatches.length, maxResults); i++) {
        const m = altMatches[i];
        let rawUrl = m[1];
        if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
        const title = stripTags(m[2]).trim();
        if (title) results.push({ title, snippet: '', url: rawUrl });
      }
    }

    return JSON.stringify({
      success: true,
      query,
      results,
      count: results.length,
      rendered: renderJs,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return JSON.stringify({ success: false, error: '搜索超时（5秒）' });
    }
    return JSON.stringify({
      success: false,
      error: `搜索失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// ===================== Handler: web_fetch =====================

export async function handleWebFetch(args: Record<string, unknown>): Promise<string> {
  const rawUrl = String(args.url || '').trim();
  if (!rawUrl) {
    return JSON.stringify({ success: false, error: 'URL 不能为空' });
  }

  // 校验 URL 协议
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return JSON.stringify({ success: false, error: '仅支持 http/https 协议的 URL' });
    }
  } catch {
    return JSON.stringify({ success: false, error: `无效的 URL: ${rawUrl}` });
  }

  const maxLength = Math.min(Number(args.maxLength) || 80000, 200000);
  const renderJs = args.renderJs === true;

  // ---- JS 渲染模式 ----
  if (renderJs) {
    const rendered = await tryRenderContent(rawUrl);
    if (rendered) {
      const markdown = htmlToMarkdown(rendered.html);

      let truncated = false;
      let finalMd = markdown;
      if (Buffer.byteLength(finalMd, 'utf8') > maxLength) {
        finalMd = finalMd.substring(0, maxLength);
        while (Buffer.byteLength(finalMd, 'utf8') > maxLength) {
          finalMd = finalMd.substring(0, finalMd.length - 1);
        }
        finalMd += '\n\n> ⚠️ 内容过长，已截断至 ' + maxLength + ' 字节';
        truncated = true;
      }

      return JSON.stringify({
        success: true,
        url: rendered.finalUrl,
        title: rendered.title,
        contentType: 'text/html',
        length: Buffer.byteLength(rendered.html, 'utf8'),
        truncated,
        rendered: true,
        markdown: finalMd,
      });
    }
    // Playwright 不可用 → 降级到原生 fetch
  }

  // ---- 原生 fetch 模式 ----
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(rawUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'CrossWMS-AI/1.0',
        'Accept': 'text/html, application/json, text/*',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: `请求失败: HTTP ${response.status} ${response.statusText}`,
      });
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    const text = await response.text();

    let markdown: string;
    if (contentType.includes('text/html')) {
      markdown = htmlToMarkdown(text);
    } else if (contentType.includes('application/json')) {
      // JSON 直接保留原样，格式化
      try {
        const parsed = JSON.parse(text);
        markdown = '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
      } catch {
        markdown = text;
      }
    } else {
      markdown = text;
    }

    let truncated = false;
    if (Buffer.byteLength(markdown, 'utf8') > maxLength) {
      markdown = markdown.substring(0, maxLength);
      // 确保不截断在 UTF-8 字符中间
      while (Buffer.byteLength(markdown, 'utf8') > maxLength) {
        markdown = markdown.substring(0, markdown.length - 1);
      }
      markdown += '\n\n> ⚠️ 内容过长，已截断至 ' + maxLength + ' 字节';
      truncated = true;
    }

    return JSON.stringify({
      success: true,
      url: rawUrl,
      contentType,
      length: Buffer.byteLength(text, 'utf8'),
      truncated,
      rendered: false,
      markdown,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return JSON.stringify({ success: false, error: '抓取超时（10秒）' });
    }
    return JSON.stringify({
      success: false,
      error: `抓取失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// ===================== Handler: web_api_call =====================

export async function handleWebApiCall(args: Record<string, unknown>): Promise<string> {
  // v3.0: 如果指定了 templateId，使用 webApiTemplates 引擎执行
  if (args.templateId) {
    try {
      const { executeApiTemplate } = await import('./webApiTemplates.js');
      const result = await executeApiTemplate({
        templateId: args.templateId as string,
        variables: (args.variables as Record<string, string>) || {},
        extraHeaders: args.headers as Record<string, string> | undefined,
        extraBody: args.body as string | undefined,
      });
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: `模板执行失败: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const urlStr = String(args.url || '').trim();
  if (!urlStr) {
    return JSON.stringify({ success: false, error: 'URL 不能为空' });
  }

  // 域名白名单检查
  // v3.0: isDomainAllowed 现在由 DB + 缓存 + fallback 提供
  let hostname = '';
  try {
    hostname = new URL(urlStr).hostname.toLowerCase();
  } catch {
    // invalid URL
  }
  if (!isDomainAllowed(hostname)) {
    return JSON.stringify({
      success: false,
      error: `域名不在白名单中: ${hostname || urlStr}`,
    });
  }

  const method = String(args.method || 'GET').toUpperCase();
  // v3.0: 扩展支持 PATCH/OPTIONS
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].includes(method)) {
    return JSON.stringify({ success: false, error: `不支持的 HTTP 方法: ${method}` });
  }

  // 解析 headers
  let headers: Record<string, string> = {};
  if (args.headers && typeof args.headers === 'object') {
    headers = args.headers as Record<string, string>;
  }

  // body
  const body = args.body ? String(args.body) : undefined;
  const renderJs = args.renderJs === true;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const requestInit: RequestInit = {
      method,
      headers: {
        ...headers,
        'User-Agent': 'CrossWMS-AI/1.0',
      },
      signal: controller.signal,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      requestInit.body = body;
    }

    const response = await fetch(urlStr, requestInit);
    clearTimeout(timeoutId);

    const resContentType = response.headers.get('content-type') || '';
    const resText = await response.text();

    // ---- JS 渲染模式：响应是 HTML 时用 Playwright 渲染 ----
    if (renderJs && resContentType.includes('text/html')) {
      const rendered = await tryRenderContent(urlStr);
      if (rendered) {
        const markdown = htmlToMarkdown(rendered.html);
        let truncated = false;
        let finalMd = markdown;
        if (finalMd.length > 50000) {
          finalMd = finalMd.substring(0, 50000) + '\n\n> ⚠️ 响应过长，已截断至 50KB';
          truncated = true;
        }

        return JSON.stringify({
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType: resContentType,
          rendered: true,
          data: finalMd,
          truncated,
        });
      }
      // Playwright 不可用 → 降级到普通处理
    }

    // 处理响应 body
    let data: unknown;
    if (resContentType.includes('application/json')) {
      try {
        data = JSON.parse(resText);
      } catch {
        data = resText.substring(0, 50000);
      }
    } else {
      data = resText.substring(0, 50000);
    }

    // 如果 data 是字符串且过长，截断
    if (typeof data === 'string' && data.length > 50000) {
      data = data.substring(0, 50000) + '\n\n> ⚠️ 响应过长，已截断至 50KB';
    }

    return JSON.stringify({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: resContentType,
      rendered: false,
      data,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return JSON.stringify({ success: false, error: 'API 调用超时（15秒）' });
    }
    return JSON.stringify({
      success: false,
      error: `API 调用失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
