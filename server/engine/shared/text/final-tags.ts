// final 标签辅助：检测 assistant 文本中的 final-answer 标签区域
type FinalTagMatch = {
  index: number;
  text: string;
  isClose: boolean;
  isSelfClosing: boolean;
};

const FINAL_TAG_CANDIDATE_RE = /<[^<>]*>/g;

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function parseAttributeList(text: string): boolean {
  let index = 0;
  while (index < text.length) {
    while (index < text.length && isWhitespace(text[index] ?? "")) {
      index += 1;
    }
    if (index >= text.length) {
      return true;
    }

    const nameStart = index;
    while (index < text.length) {
      const char = text[index] ?? "";
      if (isWhitespace(char) || char === "=") {
        break;
      }
      if (char === "/" || char === '"' || char === "'" || char === "<" || char === ">") {
        return false;
      }
      index += 1;
    }
    if (index === nameStart) {
      return false;
    }

    while (index < text.length && isWhitespace(text[index] ?? "")) {
      index += 1;
    }
    if (text[index] !== "=") {
      continue;
    }
    index += 1;
    while (index < text.length && isWhitespace(text[index] ?? "")) {
      index += 1;
    }
    if (index >= text.length) {
      return false;
    }

    const quote = text[index];
    if (quote === '"' || quote === "'") {
      index += 1;
      const end = text.indexOf(quote, index);
      if (end === -1) {
        return false;
      }
      index = end + 1;
      continue;
    }

    const valueStart = index;
    while (index < text.length && !isWhitespace(text[index] ?? "")) {
      const char = text[index] ?? "";
      if (char === '"' || char === "'" || char === "<" || char === ">") {
        return false;
      }
      index += 1;
    }
    if (index === valueStart) {
      return false;
    }
  }
  return true;
}

/** 解析候选 `<final>` 标签，拒绝形似名与畸形属性 */
function parseFinalTag(text: string): Omit<FinalTagMatch, "index" | "text"> | null {
  if (!text.startsWith("<") || !text.endsWith(">")) {
    return null;
  }

  let body = text.slice(1, -1).trimStart();
  let isClose = false;
  if (body.startsWith("/")) {
    isClose = true;
    body = body.slice(1).trimStart();
  }

  if (!body.toLowerCase().startsWith("final")) {
    return null;
  }
  const boundary = body[5] ?? "";
  if (boundary && !isWhitespace(boundary) && boundary !== "/") {
    return null;
  }

  let rest = body.slice(5);
  if (isClose) {
    return rest.trim().length === 0 ? { isClose: true, isSelfClosing: false } : null;
  }

  const trimmedRest = rest.trimEnd();
  const isSelfClosing = trimmedRest.endsWith("/");
  rest = isSelfClosing ? trimmedRest.slice(0, -1) : rest;
  if (!parseAttributeList(rest)) {
    return null;
  }
  return { isClose: false, isSelfClosing };
}

/** 找到合法的 `<final>` 控制标签，便于调用方只剥离实际模型标记 */
export function findFinalTagMatches(text: string): FinalTagMatch[] {
  const matches: FinalTagMatch[] = [];
  for (const match of text.matchAll(FINAL_TAG_CANDIDATE_RE)) {
    const tagText = match[0];
    const parsed = parseFinalTag(tagText);
    if (!parsed) {
      continue;
    }
    matches.push({
      index: match.index ?? 0,
      text: tagText,
      ...parsed,
    });
  }
  return matches;
}

/** 移除合法的 `<final>` 标签同时保留其内可见的答案文本 */
export function stripFinalTags(text: string): string {
  let output = "";
  let lastIndex = 0;
  for (const match of findFinalTagMatches(text)) {
    output += text.slice(lastIndex, match.index);
    lastIndex = match.index + match.text.length;
  }
  output += text.slice(lastIndex);
  return output;
}
