/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/tool-result-char-estimator.ts
 *
 * cross-wms 降级实现：消息和工具结果字符数估算。
 * 直接移植核心估算逻辑，不依赖 OpenClaw runtime 类型。
 */

export const CHARS_PER_TOKEN_ESTIMATE = 4;
export const TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE = 2;
const IMAGE_CHAR_ESTIMATE = 8_000;

export type MessageCharEstimateCache = WeakMap<object, number>;

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
}

function isImageBlock(block: unknown): boolean {
  return (
    Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "image"
  );
}

function estimateUnknownChars(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }
  if (value === undefined) {
    return 0;
  }
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized.length : 0;
  } catch {
    return 256;
  }
}

export function isToolResultMessage(msg: Record<string, unknown>): boolean {
  const role = msg.role;
  const type = msg.type;
  return role === "toolResult" || role === "tool" || type === "toolResult";
}

function getToolResultContent(msg: Record<string, unknown>): unknown[] {
  if (!isToolResultMessage(msg)) {
    return [];
  }
  const content = msg.content;
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return Array.isArray(content) ? content : [];
}

function estimateContentBlockChars(content: unknown[]): number {
  let chars = 0;
  for (const block of content) {
    if (isTextBlock(block)) {
      chars += block.text.length;
    } else if (isImageBlock(block)) {
      chars += IMAGE_CHAR_ESTIMATE;
    } else {
      chars += estimateUnknownChars(block);
    }
  }
  return chars;
}

export function getToolResultText(msg: Record<string, unknown>): string {
  const content = getToolResultContent(msg);
  const chunks: string[] = [];
  for (const block of content) {
    if (isTextBlock(block)) {
      chunks.push(block.text);
    }
  }
  return chunks.join("\n");
}

function estimateMessageChars(msg: Record<string, unknown>): number {
  if (!msg || typeof msg !== "object") {
    return 0;
  }

  if (msg.role === "user") {
    const content = msg.content;
    if (typeof content === "string") {
      return content.length;
    }
    if (Array.isArray(content)) {
      return estimateContentBlockChars(content);
    }
    return 0;
  }

  if (msg.role === "assistant") {
    let chars = 0;
    const content = msg.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const typed = block as Record<string, unknown>;
        if (typed.type === "text" && typeof typed.text === "string") {
          chars += typed.text.length;
        } else if (typed.type === "thinking" && typeof typed.thinking === "string") {
          chars += (typed.thinking as string).length;
        } else if (typed.type === "toolCall") {
          try {
            chars += JSON.stringify(typed.arguments ?? {}).length;
          } catch {
            chars += 128;
          }
        } else {
          chars += estimateUnknownChars(block);
        }
      }
    }
    return chars;
  }

  if (isToolResultMessage(msg)) {
    const content = getToolResultContent(msg);
    const chars = estimateContentBlockChars(content);
    const weightedChars = Math.ceil(
      chars * (CHARS_PER_TOKEN_ESTIMATE / TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE),
    );
    return Math.max(chars, weightedChars);
  }

  return 256;
}

export function createMessageCharEstimateCache(): MessageCharEstimateCache {
  return new WeakMap<object, number>();
}

export function estimateMessageCharsCached(
  msg: Record<string, unknown>,
  cache: MessageCharEstimateCache,
): number {
  const hit = cache.get(msg);
  if (hit !== undefined) {
    return hit;
  }
  const estimated = estimateMessageChars(msg);
  cache.set(msg, estimated);
  return estimated;
}

export function estimateContextChars(
  messages: Record<string, unknown>[],
  cache: MessageCharEstimateCache,
): number {
  return messages.reduce((sum, msg) => sum + estimateMessageCharsCached(msg, cache), 0);
}

export function invalidateMessageCharsCacheEntry(
  cache: MessageCharEstimateCache,
  msg: Record<string, unknown>,
): void {
  cache.delete(msg);
}
