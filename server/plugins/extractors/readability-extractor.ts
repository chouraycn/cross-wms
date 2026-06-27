/**
 * Readability Content Extractor — 基于 Mozilla Readability 的正文提取器
 *
 * 使用 @mozilla/readability 提取网页正文内容，
 * 支持 markdown / text / html 三种输出模式，
 * markdown 模式使用 turndown 进行 HTML → Markdown 转换。
 */

import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { JSDOM } from "jsdom";
import * as cheerio from "cheerio";
import type {
  WebContentExtractorPlugin,
  WebContentExtractionRequest,
  WebContentExtractionResult,
  WebContentExtractMode,
} from "../web-content-extractor-types.js";
import { registerWebContentExtractor } from "../web-content-extractors.js";

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

// ==================== HTML 清理 ====================

function cleanHtmlForReadability(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, noscript, iframe").remove();

  return $.html();
}

// ==================== Readability 解析 ====================

interface ParsedResult {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  siteName: string;
}

function parseWithReadability(
  html: string,
  url: string,
): ParsedResult | null {
  try {
    const cleanedHtml = cleanHtmlForReadability(html);
    const dom = new JSDOM(cleanedHtml, { url });
    const doc = dom.window.document;

    const reader = new Readability(doc, {
      charThreshold: 80,
    });

    const article = reader.parse();
    if (!article || !article.content) {
      return null;
    }

    return {
      title: article.title || "",
      content: article.content || "",
      textContent: article.textContent || "",
      length: article.length || 0,
      excerpt: article.excerpt || "",
      byline: article.byline || "",
      siteName: article.siteName || "",
    };
  } catch {
    return null;
  }
}

// ==================== Turndown Markdown 转换 ====================

let turndownService: TurndownService | null = null;

function getTurndownService(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
  }
  return turndownService;
}

function htmlToMarkdown(html: string): string {
  try {
    const service = getTurndownService();
    return service.turndown(html);
  } catch {
    return html;
  }
}

// ==================== 内容格式化 ====================

function formatContent(
  parsed: ParsedResult,
  mode: WebContentExtractMode,
): { content: string; contentType: string } {
  switch (mode) {
    case "markdown": {
      let md = "";
      if (parsed.title) {
        md += `# ${parsed.title}\n\n`;
      }
      if (parsed.byline) {
        md += `*${parsed.byline}*\n\n`;
      }
      md += htmlToMarkdown(parsed.content);
      return { content: md, contentType: "text/markdown" };
    }
    case "text": {
      let text = "";
      if (parsed.title) {
        text += `${parsed.title}\n\n`;
      }
      if (parsed.byline) {
        text += `${parsed.byline}\n\n`;
      }
      text += parsed.textContent;
      return { content: text, contentType: "text/plain" };
    }
    case "html":
    default: {
      let html = "";
      if (parsed.title) {
        html += `<h1>${parsed.title}</h1>\n`;
      }
      if (parsed.byline) {
        html += `<p><em>${parsed.byline}</em></p>\n`;
      }
      html += parsed.content;
      return { content: html, contentType: "text/html" };
    }
  }
}

// ==================== Extractor 定义 ====================

const extractor: WebContentExtractorPlugin = {
  id: "readability",
  label: "Readability",
  hint: "基于 Mozilla Readability 的智能正文提取",
  autoDetectOrder: 100,

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

    const parsed = parseWithReadability(html, url);
    if (!parsed) {
      return null;
    }

    const formatted = formatContent(parsed, extractMode);

    let finalContent = formatted.content;
    let truncated = false;

    if (maxLength && maxLength > 0) {
      const result = smartTruncate(formatted.content, maxLength, extractMode);
      finalContent = result.content;
      truncated = result.truncated;
    }

    return {
      content: finalContent,
      title: parsed.title || undefined,
      contentType: formatted.contentType,
      contentLength: finalContent.length,
      truncated,
      extractorId: "readability",
    };
  },
};

// ==================== 自动注册 ====================

registerWebContentExtractor("readability", extractor);

export default extractor;
