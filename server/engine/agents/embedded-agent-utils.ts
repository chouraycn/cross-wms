/**
 * 移植自 openclaw/src/agents/embedded-agent-utils.ts
 *
 * Embedded-agent message text utilities.
 * Extracts visible assistant text, reasoning summaries, thinking-tag blocks,
 * and compact tool metadata for channel delivery and transcript replay.
 */

export { stripModelSpecialTokens } from "../shared/text/model-special-tokens.js";

const THINKING_TAG_NAME_PATTERN = String.raw`(?:(?:antml:|mm:)?(?:think(?:ing)?|thought)|antthinking)`;

/** Global regex used to scan provider-emitted thinking tags. */
export const THINKING_TAG_SCAN_RE = new RegExp(
  String.raw`<\s*(\/?)\s*${THINKING_TAG_NAME_PATTERN}\s*>`,
  "gi",
);

const THINKING_TAG_OPEN_RE = new RegExp(String.raw`<\s*${THINKING_TAG_NAME_PATTERN}\s*>`, "i");
const THINKING_TAG_CLOSE_RE = new RegExp(
  String.raw`<\s*\/\s*${THINKING_TAG_NAME_PATTERN}\s*>`,
  "i",
);
const THINKING_TAG_OPEN_GLOBAL_RE = new RegExp(
  String.raw`<\s*${THINKING_TAG_NAME_PATTERN}\s*>`,
  "gi",
);
const THINKING_TAG_CLOSE_GLOBAL_RE = new RegExp(
  String.raw`<\s*\/\s*${THINKING_TAG_NAME_PATTERN}\s*>`,
  "gi",
);

type AssistantMessage = {
  role: "assistant";
  content: string | Array<{ type: string; text?: string; thinking?: string; thinkingSignature?: string; textSignature?: unknown; [key: string]: unknown }>;
  stopReason?: string;
  phase?: unknown;
  [key: string]: unknown;
};

type AgentMessage = {
  role: string;
  content?: unknown;
  [key: string]: unknown;
};

/** Narrow an agent message to an assistant message. */
export function isAssistantMessage(msg: AgentMessage | undefined): msg is AssistantMessage {
  return msg?.role === "assistant";
}

/**
 * Strip thinking tags and their content from text.
 * This is a safety net for cases where the model outputs thinking tags
 * that slip through other filtering mechanisms.
 */
export function stripThinkingTagsFromText(text: string): string {
  return text.replace(
    new RegExp(String.raw`<\s*(?:antml:|mm:)?(?:think(?:ing)?|thought|antthinking)\s*>[\s\S]*?<\s*\/\s*(?:antml:|mm:)?(?:think(?:ing)?|thought|antthinking)\s*>`, "gi"),
    "",
  ).trim();
}

function sanitizeAssistantText(text: string): string {
  // Basic sanitization: strip ANSI escape codes and control characters
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function sanitizeAssistantVisibleStreamText(text: string): string {
  return sanitizeAssistantText(text);
}

/** Extract text intended for users, preferring explicit final-answer phase blocks. */
export function extractAssistantVisibleText(msg: AssistantMessage): string {
  if (typeof msg.content === "string") {
    return sanitizeAssistantText(msg.content);
  }
  if (!Array.isArray(msg.content)) {
    return "";
  }
  return msg.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => sanitizeAssistantText(block.text!))
    .filter(Boolean)
    .join("\n");
}

/** Extract sanitized assistant text across all text content blocks. */
export function extractAssistantText(msg: AssistantMessage): string {
  if (typeof msg.content === "string") {
    return sanitizeAssistantText(msg.content);
  }
  if (!Array.isArray(msg.content)) {
    return "";
  }
  return msg.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => sanitizeAssistantText(block.text!))
    .filter(Boolean)
    .join("\n");
}

/** Extract native thinking block text or a placeholder when only signed reasoning exists. */
export function extractAssistantThinking(msg: AssistantMessage): string {
  if (!Array.isArray(msg.content)) {
    return "";
  }
  const blocks = msg.content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      if (block.type === "thinking" && typeof block.thinking === "string") {
        const thinking = block.thinking.trim();
        if (thinking) {
          return thinking;
        }
        if (typeof block.thinkingSignature === "string" && block.thinkingSignature.trim()) {
          return "Native reasoning was produced; no summary text was returned.";
        }
      }
      return "";
    })
    .filter(Boolean);
  return blocks.join("\n").trim();
}

/** Format reasoning text for markdown-friendly channel surfaces. */
export function formatReasoningMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const italicLines = trimmed
    .split("\n")
    .map((line) => (line ? `_${line}_` : line))
    .join("\n");
  return `Thinking\n\n${italicLines}`;
}

type ThinkTaggedSplitBlock =
  | { type: "thinking"; thinking: string }
  | { type: "text"; text: string };

/** Split text that starts with thinking tags into structured thinking/text blocks. */
export function splitThinkingTaggedText(text: string): ThinkTaggedSplitBlock[] | null {
  const trimmedStart = text.trimStart();
  if (!trimmedStart.startsWith("<")) {
    return null;
  }
  if (!THINKING_TAG_OPEN_RE.test(trimmedStart)) {
    return null;
  }
  if (!THINKING_TAG_CLOSE_RE.test(text)) {
    return null;
  }

  let inThinking = false;
  let cursor = 0;
  let thinkingStart = 0;
  const blocks: ThinkTaggedSplitBlock[] = [];

  const pushText = (value: string) => {
    if (!value) return;
    blocks.push({ type: "text", text: value });
  };
  const pushThinking = (value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    blocks.push({ type: "thinking", thinking: cleaned });
  };

  for (const match of text.matchAll(THINKING_TAG_SCAN_RE)) {
    const index = match.index ?? 0;
    const isClose = match[1]?.includes("/") ?? false;

    if (!inThinking && !isClose) {
      pushText(text.slice(cursor, index));
      thinkingStart = index + match[0].length;
      inThinking = true;
      continue;
    }

    if (inThinking && isClose) {
      pushThinking(text.slice(thinkingStart, index));
      cursor = index + match[0].length;
      inThinking = false;
    }
  }

  if (inThinking) {
    return null;
  }
  pushText(text.slice(cursor));

  const hasThinking = blocks.some((b) => b.type === "thinking");
  if (!hasThinking) {
    return null;
  }
  return blocks;
}

/** Promote inline thinking-tag text blocks into native thinking blocks in place. */
export function promoteThinkingTagsToBlocks(message: AssistantMessage): void {
  if (!Array.isArray(message.content)) {
    return;
  }
  const hasThinkingBlock = message.content.some(
    (block) => block && typeof block === "object" && block.type === "thinking",
  );
  if (hasThinkingBlock) {
    return;
  }

  const next: AssistantMessage["content"] = [];
  let changed = false;

  for (const block of message.content) {
    if (!block || typeof block !== "object" || !("type" in block)) {
      next.push(block);
      continue;
    }
    if (block.type !== "text") {
      next.push(block);
      continue;
    }
    const split = splitThinkingTaggedText(block.text ?? "");
    if (!split) {
      next.push(block);
      continue;
    }
    changed = true;
    for (const part of split) {
      if (part.type === "thinking") {
        next.push({ type: "thinking", thinking: part.thinking });
      } else if (part.type === "text") {
        const cleaned = part.text.trimStart();
        if (cleaned) {
          next.push({ type: "text", text: cleaned });
        }
      }
    }
  }

  if (!changed) {
    return;
  }
  message.content = next;
}

/** Extract closed thinking-tag content from a complete text payload. */
export function extractThinkingFromTaggedText(text: string): string {
  if (!text) {
    return "";
  }
  let result = "";
  let lastIndex = 0;
  let inThinking = false;
  for (const match of text.matchAll(THINKING_TAG_SCAN_RE)) {
    const idx = match.index ?? 0;
    if (inThinking) {
      result += text.slice(lastIndex, idx);
    }
    const isClose = match[1] === "/";
    inThinking = !isClose;
    lastIndex = idx + match[0].length;
  }
  return result.trim();
}

/** Extract thinking-tag content from a possibly incomplete streaming payload. */
export function extractThinkingFromTaggedStream(text: string): string {
  if (!text) {
    return "";
  }
  const closed = extractThinkingFromTaggedText(text);
  if (closed) {
    return closed;
  }

  const openMatches = [...text.matchAll(THINKING_TAG_OPEN_GLOBAL_RE)];
  if (openMatches.length === 0) {
    return "";
  }
  const closeMatches = [...text.matchAll(THINKING_TAG_CLOSE_GLOBAL_RE)];
  const lastOpen = openMatches[openMatches.length - 1];
  const lastClose = closeMatches[closeMatches.length - 1];
  if (lastClose && (lastClose.index ?? -1) > (lastOpen.index ?? -1)) {
    return closed;
  }
  const start = (lastOpen.index ?? 0) + lastOpen[0].length;
  return text.slice(start).trim();
}

/** Infer compact display metadata for a tool call from its args. */
export function inferToolMetaFromArgs(
  toolName: string,
  args: unknown,
  options?: { detailMode?: "explain" | "raw" },
): string | undefined {
  const name = toolName ?? "unknown";
  if (!args || typeof args !== "object") {
    return `[${name}]`;
  }
  try {
    const brief = JSON.stringify(args).slice(0, 120);
    return `[${name}] ${brief}`;
  } catch {
    return `[${name}]`;
  }
}
