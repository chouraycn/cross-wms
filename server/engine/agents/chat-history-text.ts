/**
 * Chat-history text helpers for session tools.
 * Ported from openclaw/src/agents/tools/chat-history-text.ts
 */

/** Removes tool messages from a message array. */
export function stripToolMessages(messages: unknown[]): unknown[] {
  return messages.filter((msg) => {
    if (!msg || typeof msg !== "object") {
      return true;
    }
    const role = (msg as { role?: unknown }).role;
    return role !== "toolResult" && role !== "tool";
  });
}

/** Sanitize text content to strip tool call markers and thinking tags. */
export function sanitizeTextContent(text: string): string {
  // Strip common thinking/reasoning tags that would leak to user-facing text
  let result = text;
  result = result.replace(/<\/?thinking[^>]*>/gi, "");
  result = result.replace(/<\/?reasoning[^>]*>/gi, "");
  result = result.replace(/<\/?thought[^>]*>/gi, "");
  return result.trim();
}

/** Extract assistant-visible text from a message object. */
export function extractAssistantText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  if ((message as { role?: unknown }).role !== "assistant") {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return sanitizeTextContent(content);
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const textParts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { type?: string; text?: string };
    if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
      textParts.push(typedBlock.text);
    }
  }
  const joined = textParts.join("");
  return joined ? sanitizeTextContent(joined) : undefined;
}
