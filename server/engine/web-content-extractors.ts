/**
 * Web Content Extractors — 网页内容提取器实现
 *
 * 提供多种内容提取策略：
 * - ReadabilityExtractor: 类 Readability 的文章提取（基于启发式算法）
 * - BasicExtractor: 基础 HTML→Markdown/Text 提取
 *
 * 支持回退链：Readability 失败时自动降级到 Basic
 */

import { load } from "cheerio";
import type {
  WebContentExtractionRequest,
  WebContentExtractionResult,
  WebContentExtractorPlugin,
} from "../plugins/web-content-extractor-types.js";
import { logger } from "../logger.js";

type CheerioAPI = ReturnType<typeof load>;
type CheerioElement = ReturnType<CheerioAPI>["get"] extends (
  i: number,
) => infer T
  ? T
  : unknown;

// ==================== 工具函数 ====================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function truncateSmart(
  text: string,
  maxLength: number,
): { content: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { content: text, truncated: false };
  }

  let result = text.substring(0, maxLength);
  const lastSpace = result.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.8) {
    result = result.substring(0, lastSpace);
  }
  return { content: result + "\n\n[内容已截断]", truncated: true };
}

// ==================== HTML → Markdown 转换 ====================

function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  md = md.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  md = md.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  md = md.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

  md = md.replace(
    /<h1[^>]*>([\s\S]*?)<\/h1>/gi,
    (_, c) => `\n\n# ${stripHtml(c)}\n\n`,
  );
  md = md.replace(
    /<h2[^>]*>([\s\S]*?)<\/h2>/gi,
    (_, c) => `\n\n## ${stripHtml(c)}\n\n`,
  );
  md = md.replace(
    /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
    (_, c) => `\n\n### ${stripHtml(c)}\n\n`,
  );
  md = md.replace(
    /<h4[^>]*>([\s\S]*?)<\/h4>/gi,
    (_, c) => `\n\n#### ${stripHtml(c)}\n\n`,
  );
  md = md.replace(
    /<h5[^>]*>([\s\S]*?)<\/h5>/gi,
    (_, c) => `\n\n##### ${stripHtml(c)}\n\n`,
  );
  md = md.replace(
    /<h6[^>]*>([\s\S]*?)<\/h6>/gi,
    (_, c) => `\n###### ${stripHtml(c)}\n\n`,
  );

  md = md.replace(/<\/?(?:strong|b)[^>]*>/gi, "**");
  md = md.replace(/<\/?(?:em|i)[^>]*>/gi, "*");

  md = md.replace(
    /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    "[$2]($1)",
  );

  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  md = md.replace(
    /<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi,
    (_, c) => `\n\n\`\`\`\n${c}\n\`\`\`\n\n`,
  );
  md = md.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, c) => `\n\n\`\`\`\n${stripHtml(c)}\n\`\`\`\n\n`,
  );

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `\n- ${stripHtml(c)}`);

  md = md.replace(
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    (_, c) => `\n\n${stripHtml(c)}\n\n`,
  );

  md = md.replace(/<br\s*\/?>/gi, "\n");

  md = md.replace(
    /<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi,
    "![$2]($1)",
  );
  md = md.replace(
    /<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*>/gi,
    "![$1]($2)",
  );

  md = stripHtml(md);
  md = decodeHtmlEntities(md);
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim();

  return md;
}

// ==================== Readability 风格提取器 ====================

const UNLIKELY_CANDIDATES =
  /combx|comment|community|disqus|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter/i;
const POSITIVE_SCORE =
  /article|body|content|entry|hentry|main|page|pagination|post|text|blog|story/i;
const NEGATIVE_SCORE =
  /hidden|hid|obscure|teaser|click|score|com-|nav|menu|header|footer|footnote|masthead|byline|caption|cite|pullquote|related|scroll|sidebar|sponsor|agegate|pagination|pager|popup|tweet|twitter|by|tags|tag|sidebar|sponsor|advert|ad-/i;

interface CandidateElement {
  elem: unknown;
  score: number;
}

function getElemAttr($: CheerioAPI, elem: unknown, attr: string): string {
  return $(elem as never).attr(attr) || "";
}

function getElemTag($: CheerioAPI, elem: unknown): string {
  const el = $(elem as never).get(0);
  if (!el) return "";
  return (el as { name?: string }).name || "";
}

function getClassWeight($: CheerioAPI, elem: unknown): number {
  let score = 0;
  const className = getElemAttr($, elem, "class");
  const id = getElemAttr($, elem, "id");

  if (POSITIVE_SCORE.test(className)) score += 25;
  if (POSITIVE_SCORE.test(id)) score += 25;
  if (NEGATIVE_SCORE.test(className)) score -= 25;
  if (NEGATIVE_SCORE.test(id)) score -= 25;

  return score;
}

function getLinkDensity($: CheerioAPI, elem: unknown): number {
  const textLength = $(elem as never).text().length || 1;
  const linkLength = $("a", elem as never).text().length;
  return linkLength / textLength;
}

function getElemParent(elem: unknown): unknown {
  const el = elem as { parent?: unknown };
  return el.parent || null;
}

function extractReadability(
  $: CheerioAPI,
  request: WebContentExtractionRequest,
): WebContentExtractionResult | null {
  const title = $("title").text().trim() || $("h1").first().text().trim();

  $("script, style, noscript, iframe, svg, canvas, video, audio").remove();

  const candidates: Map<string, CandidateElement> = new Map();

  $("p, pre, td, blockquote").each((_, elem) => {
    const parent = getElemParent(elem);
    const grandParent = parent ? getElemParent(parent) : null;
    if (!parent || !grandParent) return;

    const innerText = $(elem).text().trim();
    if (innerText.length < 25) return;

    const parentKey = `${getElemAttr($, parent, "class")}_${getElemAttr($, parent, "id")}_${getElemTag($, parent)}`;
    const grandParentKey = `${getElemAttr($, grandParent, "class")}_${getElemAttr($, grandParent, "id")}_${getElemTag($, grandParent)}`;

    if (!candidates.has(parentKey)) {
      candidates.set(parentKey, { elem: parent, score: 0 });
      const candidate = candidates.get(parentKey)!;
      candidate.score += getClassWeight($, parent);
    }
    if (!candidates.has(grandParentKey)) {
      candidates.set(grandParentKey, { elem: grandParent, score: 0 });
      const candidate = candidates.get(grandParentKey)!;
      candidate.score += getClassWeight($, grandParent);
    }

    let contentScore = 1;
    contentScore += innerText.split(/[,，。.!?！？]/).length;
    contentScore += Math.min(Math.floor(innerText.length / 100), 3);

    const parentCandidate = candidates.get(parentKey)!;
    parentCandidate.score += contentScore;

    const grandParentCandidate = candidates.get(grandParentKey)!;
    grandParentCandidate.score += contentScore / 2;
  });

  let topCandidate: CandidateElement | null = null;
  for (const candidate of candidates.values()) {
    const linkDensity = getLinkDensity($, candidate.elem);
    candidate.score *= 1 - linkDensity;

    if (!topCandidate || candidate.score > topCandidate.score) {
      topCandidate = candidate;
    }
  }

  if (!topCandidate || topCandidate.score < 20) {
    return null;
  }

  const article = $(topCandidate.elem as never);
  const articleHtml = article.html() || "";

  const siblings = article.parent().children() || [];
  let outputHtml = "";

  siblings.each((_, sibling) => {
    if (sibling === topCandidate!.elem) {
      outputHtml += `<div class="article-content">${$(sibling).html() || ""}</div>`;
      return;
    }

    const siblingWeight = getClassWeight($, sibling);
    const siblingText = $(sibling).text().trim();
    const siblingLinkDensity = getLinkDensity($, sibling);

    let bonus = 0;
    if (siblingText.length > 25) {
      bonus = Math.floor(siblingText.length / 100);
    }

    const potentialScore = siblingWeight + bonus;
    if (potentialScore > topCandidate!.score * 0.2 && siblingLinkDensity < 0.5) {
      outputHtml += $(sibling).html() || "";
    }
  });

  if (!outputHtml) {
    outputHtml = articleHtml;
  }

  let content = "";
  let contentType = "";

  switch (request.extractMode) {
    case "markdown":
      content = htmlToMarkdown(outputHtml);
      contentType = "text/markdown";
      break;
    case "text":
      content = $(outputHtml).text().trim();
      content = decodeHtmlEntities(content);
      content = content.replace(/\n{3,}/g, "\n\n");
      contentType = "text/plain";
      break;
    case "html":
      content = outputHtml;
      contentType = "text/html";
      break;
    default:
      content = htmlToMarkdown(outputHtml);
      contentType = "text/markdown";
  }

  if (request.maxLength && content.length > request.maxLength) {
    const { content: truncated, truncated: isTruncated } = truncateSmart(
      content,
      request.maxLength,
    );
    return {
      content: truncated,
      title,
      contentType,
      contentLength: truncated.length,
      truncated: isTruncated,
      extractorId: "readability",
    };
  }

  return {
    content,
    title,
    contentType,
    contentLength: content.length,
    truncated: false,
    extractorId: "readability",
  };
}

// ==================== ReadabilityExtractor 插件 ====================

export const ReadabilityExtractor: WebContentExtractorPlugin = {
  id: "readability",
  label: "Readability 文章提取器",
  hint: "基于启发式算法的智能文章内容提取",
  autoDetectOrder: 1,

  supports(_request: WebContentExtractionRequest): boolean {
    return true;
  },

  async extract(
    request: WebContentExtractionRequest,
  ): Promise<WebContentExtractionResult | null> {
    try {
      const $ = load(request.html);

      if (request.selectors && request.selectors.length > 0) {
        for (const selector of request.selectors) {
          const selected = $(selector);
          if (selected.length > 0) {
            const selectedHtml = selected.html() || "";
            const title = $("title").text().trim();

            let content = "";
            let contentType = "";

            switch (request.extractMode) {
              case "markdown":
                content = htmlToMarkdown(selectedHtml);
                contentType = "text/markdown";
                break;
              case "text":
                content = selected.text().trim();
                content = decodeHtmlEntities(content);
                contentType = "text/plain";
                break;
              case "html":
                content = selectedHtml;
                contentType = "text/html";
                break;
            }

            if (request.maxLength && content.length > request.maxLength) {
              const { content: truncated, truncated: isTruncated } =
                truncateSmart(content, request.maxLength);
              return {
                content: truncated,
                title,
                contentType,
                contentLength: truncated.length,
                truncated: isTruncated,
                extractorId: "readability",
              };
            }

            return {
              content,
              title,
              contentType,
              contentLength: content.length,
              truncated: false,
              extractorId: "readability",
            };
          }
        }
      }

      if (request.excludeSelectors && request.excludeSelectors.length > 0) {
        for (const selector of request.excludeSelectors) {
          $(selector).remove();
        }
      }

      const result = extractReadability($, request);
      if (result) {
        logger.debug("[ContentExtractor] Readability extracted successfully");
        return result;
      }

      logger.debug("[ContentExtractor] Readability extraction failed, returning null");
      return null;
    } catch (e) {
      logger.warn(
        "[ContentExtractor] Readability extractor error:",
        e instanceof Error ? e.message : String(e),
      );
      return null;
    }
  },
};

// ==================== BasicExtractor 插件 ====================

export const BasicExtractor: WebContentExtractorPlugin = {
  id: "basic",
  label: "基础内容提取器",
  hint: "基础 HTML 转换，兼容性最好",
  autoDetectOrder: 100,

  supports(_request: WebContentExtractionRequest): boolean {
    return true;
  },

  async extract(
    request: WebContentExtractionRequest,
  ): Promise<WebContentExtractionResult | null> {
    try {
      const $ = load(request.html);
      const title = $("title").text().trim();

      if (request.selectors && request.selectors.length > 0) {
        for (const selector of request.selectors) {
          const selected = $(selector);
          if (selected.length > 0) {
            const selectedHtml = selected.html() || "";

            let content = "";
            let contentType = "";

            switch (request.extractMode) {
              case "markdown":
                content = htmlToMarkdown(selectedHtml);
                contentType = "text/markdown";
                break;
              case "text":
                content = selected.text().trim();
                content = decodeHtmlEntities(content);
                contentType = "text/plain";
                break;
              case "html":
                content = selectedHtml;
                contentType = "text/html";
                break;
            }

            if (request.maxLength && content.length > request.maxLength) {
              const { content: truncated, truncated: isTruncated } =
                truncateSmart(content, request.maxLength);
              return {
                content: truncated,
                title,
                contentType,
                contentLength: truncated.length,
                truncated: isTruncated,
                extractorId: "basic",
              };
            }

            return {
              content,
              title,
              contentType,
              contentLength: content.length,
              truncated: false,
              extractorId: "basic",
            };
          }
        }
      }

      if (request.excludeSelectors && request.excludeSelectors.length > 0) {
        for (const selector of request.excludeSelectors) {
          $(selector).remove();
        }
      }

      const bodyHtml = $("body").html() || request.html;

      let content = "";
      let contentType = "";

      switch (request.extractMode) {
        case "markdown":
          content = htmlToMarkdown(bodyHtml);
          contentType = "text/markdown";
          break;
        case "text":
          content = $("body").text().trim();
          content = decodeHtmlEntities(content);
          content = content.replace(/\n{3,}/g, "\n\n");
          contentType = "text/plain";
          break;
        case "html":
          content = bodyHtml;
          contentType = "text/html";
          break;
      }

      if (request.maxLength && content.length > request.maxLength) {
        const { content: truncated, truncated: isTruncated } = truncateSmart(
          content,
          request.maxLength,
        );
        return {
          content: truncated,
          title,
          contentType,
          contentLength: truncated.length,
          truncated: isTruncated,
          extractorId: "basic",
        };
      }

      return {
        content,
        title,
        contentType,
        contentLength: content.length,
        truncated: false,
        extractorId: "basic",
      };
    } catch (e) {
      logger.warn(
        "[ContentExtractor] Basic extractor error:",
        e instanceof Error ? e.message : String(e),
      );
      return null;
    }
  },
};

// ==================== 提取器注册表 ====================

const extractors: WebContentExtractorPlugin[] = [
  ReadabilityExtractor,
  BasicExtractor,
];

export function getContentExtractors(): WebContentExtractorPlugin[] {
  return [...extractors].sort(
    (a, b) => (a.autoDetectOrder ?? 999) - (b.autoDetectOrder ?? 999),
  );
}

export async function extractContent(
  request: WebContentExtractionRequest,
): Promise<WebContentExtractionResult> {
  const sorted = getContentExtractors();

  for (const extractor of sorted) {
    try {
      const supported = await extractor.supports(request);
      if (!supported) continue;

      const result = await extractor.extract(request);
      if (result && result.content.length > 0) {
        logger.debug(`[ContentExtractor] Used extractor: ${extractor.id}`);
        return result;
      }
    } catch (e) {
      logger.warn(
        `[ContentExtractor] Extractor ${extractor.id} failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return {
    content: "",
    contentType: "text/plain",
    contentLength: 0,
    truncated: false,
    extractorId: "none",
  };
}

export function registerContentExtractor(
  extractor: WebContentExtractorPlugin,
): void {
  const existingIndex = extractors.findIndex((e) => e.id === extractor.id);
  if (existingIndex >= 0) {
    extractors[existingIndex] = extractor;
  } else {
    extractors.push(extractor);
  }
}

export function unregisterContentExtractor(id: string): boolean {
  const index = extractors.findIndex((e) => e.id === id);
  if (index >= 0) {
    extractors.splice(index, 1);
    return true;
  }
  return false;
}
