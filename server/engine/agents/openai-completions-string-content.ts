/**
 * OpenAI Chat Completions 兼容性辅助函数。
 * 部分 provider 仅接受 role/content 为纯字符串的消息，而不接受文本块数组。
 */
function flattenStringOnlyCompletionContent(content: unknown): unknown {
  if (!Array.isArray(content)) {
    return content;
  }
  const textParts: string[] = [];
  for (const item of content) {
    if (
      !item ||
      typeof item !== "object" ||
      (item as { type?: unknown }).type !== "text" ||
      typeof (item as { text?: unknown }).text !== "string"
    ) {
      return content;
    }
    textParts.push((item as { text: string }).text);
  }
  return textParts.join("\n");
}

/** 将仅包含字符串文本块的内容数组扁平化为换行拼接的字符串。 */
export function flattenCompletionMessagesToStringContent(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!message || typeof message !== "object") {
      return message;
    }
    const content = (message as { content?: unknown }).content;
    const flattenedContent = flattenStringOnlyCompletionContent(content);
    if (flattenedContent === content) {
      return message;
    }
    return {
      ...message,
      content: flattenedContent,
    };
  });
}

/** 将消息精简为 role/content 字段，以适配严格的 provider。 */
export function stripCompletionMessagesToRoleContent(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return message;
    }
    const record = message as Record<string, unknown>;
    const stripped: Record<string, unknown> = {};
    if (Object.hasOwn(record, "role")) {
      stripped.role = record.role;
    }
    if (Object.hasOwn(record, "content")) {
      stripped.content = record.content;
    }
    return stripped;
  });
}
