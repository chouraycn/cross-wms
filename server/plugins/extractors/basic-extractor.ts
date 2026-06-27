/**
 * Basic HTML Content Extractor — 基础 HTML 内容提取器（fallback）
 *
 * 使用简单的 HTML 标签清理和 Markdown 转换，
 * 作为 Readability 提取失败时的降级方案。
 * 参考 webTools.ts 中的 htmlToMarkdown 实现。
 */

import * as cheerio from "cheerio";
import type {
  WebContentExtractorPlugin,
  WebContentExtractionRequest,
  WebContentExtractionResult,
  WebContentExtractMode,
} from "../web-content-extractor-types.js";
import { registerWebContentExtractor } from "../web-content-extractors.js";

// ==================== HTML 工具函数 ====================

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function basicHtmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  md = md.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  md = md.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  md = md.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n\n# ${stripTags(c)}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n\n## ${stripTags(c)}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n\n### ${stripTags(c)}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n\n#### ${stripTags(c)}\n\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n\n##### ${stripTags(c)}\n\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `\n\n###### ${stripTags(c)}\n\n`);

  md = md.replace(/<\/?(?:strong|b)[^>]*>/gi, "**");
  md = md.replace(/<\/?(?:em|i)[^>]*>/gi, "*");

  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  md = md.replace(
    /<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi,
    (_, c) => `\n\n\`\`\`\n${c}\n\`\`\`\n\n`,
  );
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${stripTags(c)}\n\`\`\`\n\n`);

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `\n- ${stripTags(c)}`);

  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, c) => `\n\n${stripTags(c)}\n\n`);

  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => {
    const lines = stripTags(c).trim().split("\n");
    return "\n\n" + lines.map((l) => `> ${l}`).join("\n") + "\n\n";
  });

  md = stripTags(md);

  md = decodeHtmlEntities(md);

  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim();

  return md;
}

function htmlToPlainText(html: string): string {
  let text = html;

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n\n");

  text = stripTags(text);
  text = decodeHtmlEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

// ==================== 智能截断 ====================

function smartTruncate(
  content: string,
  maxLength: number,
  mode: WebContentExtractMode,
): { content: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  let truncated = content.substring(0, maxLength);

  if (mode === "text" || mode === "markdown") {
    const lastSpace = truncated.lastIndexOf(" ");
    const lastNewline = truncated.lastIndexOf("\n");
    const lastSentence = Math.max(
      truncated.lastIndexOf(". "),
      truncated.lastIndexOf("。"),
      truncated.lastIndexOf("！"),
      truncated.lastIndexOf("？"),
      truncated.lastIndexOf("! "),
      truncated.lastIndexOf("? "),
    );

    const cutPoint = Math.max(lastSpace, lastNewline, lastSentence);
    if (cutPoint > maxLength * 0.5) {
      truncated = truncated.substring(0, cutPoint + 1);
    }

    if (mode === "markdown") {
      truncated += "\n\n...";
    } else {
      truncated += " ...";
    }
  } else {
    truncated += "...";
  }

  return { content: truncated, truncated: true };
}

// ==================== 标题提取 ====================

function extractTitle(html: string, url: string): string {
  try {
    const $ = cheerio.load(html);
    const title = $("title").text().trim();
    if (title) return title;

    const h1 = $("h1").first().text().trim();
    if (h1) return h1;

    try {
      const urlObj = new URL(url);
      return urlObj.pathname.replace(/\//g, " ").trim() || urlObj.hostname;
    } catch {
      return url;
    }
  } catch {
    return "";
  }
}

// ==================== 主要内容提取 ====================

function extractMainContent(html: string): string {
  try {
    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, nav, footer, header, aside").remove();

    const selectors = [
      "article",
      "main",
      ".content",
      ".main-content",
      ".post-content",
      ".entry-content",
      "#content",
      "#main",
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length > 0 && el.text().trim().length > 200) {
        return el.html() || "";
      }
    }

    return $("body").html() || "";
  } catch {
    return html;
  }
}

// ==================== 内容格式化 ====================

function formatContent(
  html: string,
  title: string,
  mode: WebContentExtractMode,
): { content: string; contentType: string } {
  const mainContent = extractMainContent(html);

  switch (mode) {
    case "markdown": {
      let md = "";
      if (title) {
        md += `# ${title}\n\n`;
      }
      md += basicHtmlToMarkdown(mainContent);
      return { content: md, contentType: "text/markdown" };
    }
    case "text": {
      let text = "";
      if (title) {
        text += `${title}\n\n`;
      }
      text += htmlToPlainText(mainContent);
      return { content: text, contentType: "text/plain" };
    }
    case "html":
    default: {
      let resultHtml = "";
      if (title) {
        resultHtml += `<h1>${title}</h1>\n`;
      }
      resultHtml += mainContent;
      return { content: resultHtml, contentType: "text/html" };
    }
  }
}

// ==================== Extractor 定义 ====================

const extractor: WebContentExtractorPlugin = {
  id: "basic",
  label: "Basic HTML Parser",
  hint: "轻量级 HTML 内容提取，作为 fallback 使用",
  autoDetectOrder: 10,

  supports(): boolean {
    return true;
  },

  async extract(
    request: WebContentExtractionRequest,
  ): Promise<WebContentExtractionResult | null> {
    const { html, url, extractMode, maxLength } = request;

    if (!html || html.trim().length === 0) {
      return null;
    }

    const title = extractTitle(html, url);
    const formatted = formatContent(html, title, extractMode);

    let finalContent = formatted.content;
    let truncated = false;

    if (maxLength && maxLength > 0) {
      const result = smartTruncate(formatted.content, maxLength, extractMode);
      finalContent = result.content;
      truncated = result.truncated;
    }

    return {
      content: finalContent,
      title: title || undefined,
      contentType: formatted.contentType,
      contentLength: finalContent.length,
      truncated,
      extractorId: "basic",
    };
  },
};

// ==================== 自动注册 ====================

registerWebContentExtractor("basic", extractor);

export default extractor;
