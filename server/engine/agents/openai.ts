/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/openai.ts
 *
 * 降级实现：提供 OpenAI 响应归一化，不再抛出 stub 错误。
 */

export function normalizeOpenAIResponsesToolCallIds(messages: unknown[]): unknown[] {
  return messages;
}

export function downgradeOpenAIFunctionCallReasoningPairs(messages: unknown[]): unknown[] {
  return messages;
}

export function downgradeOpenAIReasoningBlocks(messages: unknown[]): unknown[] {
  return messages;
}
