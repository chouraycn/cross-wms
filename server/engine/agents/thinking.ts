/**
 * Sanitizes reasoning/thinking blocks for replay and recovery.
 * Ported from openclaw/src/agents/embedded-agent-runner/thinking.ts
 * Simplified: stream recovery and error graph collection replaced with no-op defaults.
 */

type AgentMessage = {
  role: string;
  content: Array<Record<string, unknown>>;
  stopReason?: string;
  timestamp?: unknown;
};

type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
type AssistantContentBlock = AssistantMessage["content"][number];
type RecoveryAssessment = "valid" | "incomplete-thinking" | "incomplete-text";

const THINKING_BLOCK_ERROR_PATTERN =
  /(?:thinking|redacted_thinking).*?(?:cannot be modified|signature|invalid|missing|empty|blank)|(?:signature|invalid|missing|empty|blank).*?(?:thinking|redacted_thinking)/i;
export const OMITTED_ASSISTANT_REASONING_TEXT = "[assistant reasoning omitted]";

export function isAssistantMessageWithContent(message: AgentMessage): message is AssistantMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    message.role === "assistant" &&
    Array.isArray(message.content)
  );
}

function isThinkingBlock(block: AssistantContentBlock): boolean {
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block.type === "thinking" || block.type === "redacted_thinking")
  );
}

function isToolCallBlock(block: AssistantContentBlock): boolean {
  if (!block || typeof block !== "object") {
    return false;
  }
  const type = block.type;
  return type === "toolCall" || type === "tool_use" || type === "function_call";
}

function hasAssistantToolCall(message: AssistantMessage): boolean {
  return message.content.some((block) => isToolCallBlock(block));
}

function isSignedThinkingBlock(block: AssistantContentBlock): boolean {
  if (!isThinkingBlock(block)) {
    return false;
  }
  return (
    block.type === "redacted_thinking" ||
    block.signature != null ||
    block.thinkingSignature != null ||
    block.thought_signature != null
  );
}

function hasMeaningfulText(block: AssistantContentBlock): boolean {
  if (!block || typeof block !== "object" || block.type !== "text") {
    return false;
  }
  return typeof block.text === "string" ? (block.text as string).trim().length > 0 : false;
}

function buildOmittedAssistantReasoningContent(): AssistantContentBlock[] {
  return [{ type: "text", text: OMITTED_ASSISTANT_REASONING_TEXT } as unknown as AssistantContentBlock];
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function stripSignatureFieldsFromThinkingBlock(
  block: AssistantContentBlock,
): AssistantContentBlock {
  const record = block as unknown as Record<string, unknown>;
  const stripped: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (key === "thinkingSignature" || key === "signature" || key === "thought_signature") {
      continue;
    }
    if (key === "data" && record.type === "redacted_thinking") {
      continue;
    }
    stripped[key] = record[key];
  }
  return stripped as unknown as AssistantContentBlock;
}

/** Strip all thinking signature fields from a single assistant message. */
export function stripThinkingSignaturesFromMessage(message: AgentMessage): AgentMessage {
  if (!isAssistantMessageWithContent(message)) {
    return message;
  }
  let changed = false;
  const newContent: AssistantContentBlock[] = [];
  for (const block of message.content) {
    if (!isThinkingBlock(block)) {
      newContent.push(block);
      continue;
    }
    const hasSignature =
      block.thinkingSignature != null ||
      block.signature != null ||
      block.thought_signature != null ||
      (block.type === "redacted_thinking" && block.data != null);
    if (!hasSignature) {
      newContent.push(block);
      continue;
    }
    newContent.push(stripSignatureFieldsFromThinkingBlock(block));
    changed = true;
  }
  if (!changed) {
    return message;
  }
  return { ...message, content: newContent };
}

/** Strip thinking signatures from assistant messages that predate the latest compaction. */
export function stripStaleThinkingSignaturesForCompactionReplay(
  messages: AgentMessage[],
): AgentMessage[] {
  let latestCompactionTimestamp: number | null = null;
  for (const message of messages) {
    if (message.role !== "compactionSummary") {
      continue;
    }
    const ts = parseTimestampMs(message.timestamp);
    if (ts !== null) {
      latestCompactionTimestamp =
        latestCompactionTimestamp === null ? ts : Math.max(latestCompactionTimestamp, ts);
    }
  }
  if (latestCompactionTimestamp === null) {
    return messages;
  }

  let touched = false;
  const out: AgentMessage[] = [];
  for (const message of messages) {
    if (!isAssistantMessageWithContent(message)) {
      out.push(message);
      continue;
    }
    const ts = parseTimestampMs(message.timestamp);
    if (ts === null || ts >= latestCompactionTimestamp) {
      out.push(message);
      continue;
    }
    const stripped = stripThinkingSignaturesFromMessage(message);
    if (stripped !== message) {
      touched = true;
    }
    out.push(stripped);
  }
  return touched ? out : messages;
}

function hasReplayableThinkingSignature(block: AssistantContentBlock): boolean {
  if (!isThinkingBlock(block)) {
    return false;
  }
  const candidates =
    block.type === "redacted_thinking"
      ? [block.data, block.signature, block.thinkingSignature, block.thought_signature]
      : [block.signature, block.thinkingSignature, block.thought_signature];
  return candidates.some((signature) => {
    return typeof signature === "string" && (signature as string).trim().length > 0;
  });
}

/** Strip thinking blocks with clearly invalid replay signatures. */
export function stripInvalidThinkingSignatures(
  messages: AgentMessage[],
  options: { preserveLatestAssistant?: boolean } = {},
): AgentMessage[] {
  const preserveLatestAssistant = options.preserveLatestAssistant ?? true;
  let latestAssistantIndex = -1;
  if (preserveLatestAssistant) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (isAssistantMessageWithContent(messages[i])) {
        latestAssistantIndex = i;
        break;
      }
    }
  }

  let touched = false;
  const out: AgentMessage[] = [];

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (!isAssistantMessageWithContent(message)) {
      out.push(message);
      continue;
    }
    if (i === latestAssistantIndex) {
      out.push(message);
      continue;
    }

    const nextContent: AssistantContentBlock[] = [];
    let changed = false;
    for (const block of message.content) {
      if (!isThinkingBlock(block) || hasReplayableThinkingSignature(block)) {
        nextContent.push(block);
        continue;
      }
      changed = true;
      touched = true;
    }

    if (!changed) {
      out.push(message);
      continue;
    }

    out.push({
      ...message,
      content: nextContent.length > 0 ? nextContent : buildOmittedAssistantReasoningContent(),
    });
  }

  return touched ? out : messages;
}

/** Strip thinking and redacted_thinking content blocks from all assistant messages except the latest one. */
export function dropThinkingBlocks(messages: AgentMessage[]): AgentMessage[] {
  let latestAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isAssistantMessageWithContent(messages[i])) {
      latestAssistantIndex = i;
      break;
    }
  }

  let touched = false;
  const out: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!isAssistantMessageWithContent(msg)) {
      out.push(msg);
      continue;
    }
    if (i === latestAssistantIndex) {
      out.push(msg);
      continue;
    }
    const nextContent: AssistantContentBlock[] = [];
    let changed = false;
    for (const block of msg.content) {
      if (isThinkingBlock(block)) {
        touched = true;
        changed = true;
        continue;
      }
      nextContent.push(block);
    }
    if (!changed) {
      out.push(msg);
      continue;
    }
    const content = nextContent.length > 0 ? nextContent : buildOmittedAssistantReasoningContent();
    out.push({ ...msg, content });
  }
  return touched ? out : messages;
}

function shouldPreserveCurrentToolTurnReasoning(
  messages: AgentMessage[],
  index: number,
  latestUserIndex: number,
): boolean {
  const message = messages[index];
  if (
    index < latestUserIndex ||
    !isAssistantMessageWithContent(message) ||
    !hasAssistantToolCall(message)
  ) {
    return false;
  }

  for (let i = index - 1; i >= 0; i -= 1) {
    const role = messages[i]?.role;
    if (role === "user") {
      break;
    }
    if (role === "assistant") {
      return false;
    }
  }

  for (let i = index + 1; i < messages.length; i += 1) {
    const next = messages[i];
    const role = next?.role;
    if (role === "toolResult") {
      return true;
    }
    if (role === "user") {
      return false;
    }
  }

  return false;
}

export function shouldPreserveLatestAssistantThinking(messages: AgentMessage[]): boolean {
  let latestAssistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isAssistantMessageWithContent(messages[index])) {
      latestAssistantIndex = index;
      break;
    }
  }
  if (latestAssistantIndex < 0) {
    return false;
  }
  if (latestAssistantIndex === messages.length - 1) {
    return true;
  }

  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  return shouldPreserveCurrentToolTurnReasoning(messages, latestAssistantIndex, latestUserIndex);
}

export function stripThinkingBlocksFromMessage(message: AgentMessage): AgentMessage {
  if (!isAssistantMessageWithContent(message)) {
    return message;
  }
  const nextContent = message.content.filter((block) => !isThinkingBlock(block));
  if (nextContent.length === message.content.length) {
    return message;
  }
  return {
    ...message,
    content: nextContent.length > 0 ? nextContent : buildOmittedAssistantReasoningContent(),
  };
}

function stripAllThinkingBlocks(messages: AgentMessage[]): AgentMessage[] {
  let touched = false;
  const out: AgentMessage[] = [];
  for (const message of messages) {
    const stripped = stripThinkingBlocksFromMessage(message);
    if (stripped === message) {
      out.push(stripped);
      continue;
    }
    touched = true;
    out.push(stripped);
  }
  return touched ? out : messages;
}

export function dropReasoningFromHistory(messages: AgentMessage[]): AgentMessage[] {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  let touched = false;
  const out: AgentMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!isAssistantMessageWithContent(message)) {
      out.push(message);
      continue;
    }
    if (shouldPreserveCurrentToolTurnReasoning(messages, index, latestUserIndex)) {
      out.push(message);
      continue;
    }

    const nextContent = message.content.filter((block) => !isThinkingBlock(block));
    if (nextContent.length === message.content.length) {
      out.push(message);
      continue;
    }

    touched = true;
    out.push({
      ...message,
      content: nextContent.length > 0 ? nextContent : buildOmittedAssistantReasoningContent(),
    });
  }
  return touched ? out : messages;
}

export function assessLastAssistantMessage(message: AgentMessage): RecoveryAssessment {
  if (!isAssistantMessageWithContent(message)) {
    return "valid";
  }
  if (message.content.length === 0) {
    return "incomplete-thinking";
  }

  let hasSignedThinking = false;
  let hasUnsignedThinking = false;
  let hasNonThinkingContent = false;
  let hasEmptyTextBlock = false;

  for (const block of message.content) {
    if (!block || typeof block !== "object") {
      return "incomplete-thinking";
    }
    if (isThinkingBlock(block)) {
      if (isSignedThinkingBlock(block)) {
        hasSignedThinking = true;
      } else {
        hasUnsignedThinking = true;
      }
      continue;
    }
    hasNonThinkingContent = true;
    if (block.type === "text" && !hasMeaningfulText(block)) {
      hasEmptyTextBlock = true;
    }
  }

  if (hasUnsignedThinking) {
    return "incomplete-thinking";
  }
  if (hasSignedThinking && !hasNonThinkingContent) {
    return "incomplete-text";
  }
  if (hasSignedThinking && hasEmptyTextBlock) {
    return "incomplete-text";
  }
  return "valid";
}

/** Wraps an Anthropic stream with thinking-block error recovery. */
export function wrapAnthropicStreamWithRecovery(
  innerStreamFn: (..._args: unknown[]) => unknown,
  _sessionMeta: { id: string; recoveredAnthropicThinking?: boolean; onRecoveredAnthropicThinking?: () => void | Promise<void> },
): (..._args: unknown[]) => unknown {
  // Simplified: pass-through without recovery wrapping.
  return innerStreamFn;
}
