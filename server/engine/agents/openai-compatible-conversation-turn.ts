/**
 * OpenAI-compatible conversation turn detector.
 *
 * Some providers reject requests without a non-empty user/assistant turn; this
 * helper checks the loose message payload shape before transport submission.
 *
 * 移植自 openclaw/src/agents/openai-compatible-conversation-turn.ts —— 无外部依赖。
 */
function hasNonEmptyString(value: any): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyContentPart(part: any): boolean {
  if (!part || typeof part !== "object") {
    return false;
  }
  const record = part as Record<string, any>;
  if (record.type === "text") {
    return hasNonEmptyString(record.text);
  }
  return true;
}

function hasNonEmptyMessageContent(content: any): boolean {
  if (hasNonEmptyString(content)) {
    return true;
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(hasNonEmptyContentPart);
}

function hasAssistantToolCall(message: Record<string, any>): boolean {
  const toolCalls = message.tool_calls;
  return (
    Array.isArray(toolCalls) &&
    toolCalls.some((toolCall) => {
      return Boolean(toolCall && typeof toolCall === "object");
    })
  );
}

/** Returns whether an OpenAI-compatible messages payload contains a usable turn. */
export function hasOpenAICompatibleConversationTurn(messages: any): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }
  return messages.some((message) => {
    if (!message || typeof message !== "object") {
      return false;
    }
    const record = message as Record<string, any>;
    if (record.role === "user") {
      return hasNonEmptyMessageContent(record.content);
    }
    if (record.role === "assistant") {
      return hasNonEmptyMessageContent(record.content) || hasAssistantToolCall(record);
    }
    return false;
  });
}
