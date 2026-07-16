// Feishu plugin module implements post/rich text parsing for cross-wms.

type PostContent = {
  title?: string;
  content: PostContentLine[];
};

type PostContentLine = PostContentElement[];

type PostContentElement = {
  tag: string;
  text?: string;
  user_id?: string;
  user_name?: string;
  href?: string;
  [key: string]: unknown;
};

export type ParsedPostContent = {
  title?: string;
  textContent: string;
  lines: string[];
  elements: PostContentElement[][];
  mentionTargets: Array<{ openId: string; name: string }>;
  links: Array<{ text: string; href: string }>;
};

const SUPPORTED_LOCALES = ["zh_cn", "en_us", "ja_jp"] as const;

function isSupportedLocale(key: string): key is (typeof SUPPORTED_LOCALES)[number] {
  return (SUPPORTED_LOCALES as readonly string[]).includes(key);
}

function extractTextFromElement(element: PostContentElement): string {
  switch (element.tag) {
    case "text":
      return element.text ?? "";
    case "a":
      return element.text ?? element.href ?? "";
    case "at":
      return element.user_name ? `@${element.user_name}` : "";
    case "img":
      return element.text ? `[Image: ${element.text}]` : "[Image]";
    default:
      return element.text ?? "";
  }
}

function extractMentionFromElement(element: PostContentElement): { openId: string; name: string } | null {
  if (element.tag !== "at" || !element.user_id) return null;
  return { openId: element.user_id, name: element.user_name ?? "" };
}

function extractLinkFromElement(element: PostContentElement): { text: string; href: string } | null {
  if (element.tag !== "a" || !element.href) return null;
  return { text: element.text ?? element.href, href: element.href };
}

function parsePostContentLines(lines: PostContentLine[]): {
  textLines: string[];
  allElements: PostContentElement[][];
  mentionTargets: Array<{ openId: string; name: string }>;
  links: Array<{ text: string; href: string }>;
} {
  const textLines: string[] = [];
  const allElements: PostContentElement[][] = [];
  const mentionTargets: Array<{ openId: string; name: string }> = [];
  const links: Array<{ text: string; href: string }> = [];

  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    const lineText: string[] = [];
    const lineElements: PostContentElement[] = [];

    for (const element of line) {
      if (!element || typeof element !== "object" || !element.tag) continue;
      lineElements.push(element);
      lineText.push(extractTextFromElement(element));

      const mention = extractMentionFromElement(element);
      if (mention) mentionTargets.push(mention);

      const link = extractLinkFromElement(element);
      if (link) links.push(link);
    }

    textLines.push(lineText.join(""));
    allElements.push(lineElements);
  }

  return { textLines, allElements, mentionTargets, links };
}

export function parsePostContent(rawContent: string): ParsedPostContent {
  if (!rawContent) {
    return { textContent: "", lines: [], elements: [], mentionTargets: [], links: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { textContent: rawContent, lines: [rawContent], elements: [], mentionTargets: [], links: [] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { textContent: rawContent, lines: [rawContent], elements: [], mentionTargets: [], links: [] };
  }

  const postObj = parsed as Record<string, unknown>;

  // Try to find content in locale-specific key
  let postContent: PostContent | undefined;
  let locale: string | undefined;

  for (const key of Object.keys(postObj)) {
    if (isSupportedLocale(key)) {
      locale = key;
      postContent = postObj[key] as PostContent;
      break;
    }
  }

  // Fallback: look for direct content structure
  if (!postContent) {
    if (Array.isArray(postObj.content)) {
      postContent = { content: postObj.content as PostContentLine[] };
    } else {
      return { textContent: rawContent, lines: [], elements: [], mentionTargets: [], links: [] };
    }
  }

  const title = postContent.title;
  const lines = Array.isArray(postContent.content) ? postContent.content : [];
  const { textLines, allElements, mentionTargets, links } = parsePostContentLines(lines);

  // Add title to text if present
  if (title) {
    textLines.unshift(title);
  }

  const textContent = textLines.join("\n");

  return {
    title,
    textContent,
    lines: textLines,
    elements: allElements,
    mentionTargets,
    links,
  };
}
