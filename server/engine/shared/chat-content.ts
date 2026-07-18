// 将任意 provider content 值强转为可显示文本，避免抛错
/** 把任意值转换为字符串，对象则 JSON.stringify */
export function coerceChatContentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

/** 从字符串内容或 OpenAI 风格的 text 块中抽取规范化纯文本 */
export function extractTextFromChatContent(
  content: unknown,
  opts?: {
    sanitizeText?: (text: string) => string;
    joinWith?: string;
    normalizeText?: (text: string) => string;
  },
): string | null {
  const normalizeText = opts?.normalizeText ?? ((text: string) => text.replace(/\s+/g, " ").trim());
  const joinWith = opts?.joinWith ?? " ";
  const sanitize = (text: unknown): string => {
    const raw = coerceChatContentText(text);
    const sanitized = opts?.sanitizeText ? opts.sanitizeText(raw) : raw;
    return coerceChatContentText(sanitized);
  };
  const normalize = (text: unknown): string =>
    coerceChatContentText(normalizeText(coerceChatContentText(text)));

  if (typeof content === "string") {
    const value = sanitize(content);
    const normalized = normalize(value);
    return normalized ? normalized : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    // 非 text 块包含媒体或工具 payload，这里只需要可见文本
    if ((block as { type?: unknown }).type !== "text") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    const value = sanitize(text);
    if (value.trim()) {
      chunks.push(value);
    }
  }

  const joined = normalize(chunks.join(joinWith));
  return joined ? joined : null;
}
