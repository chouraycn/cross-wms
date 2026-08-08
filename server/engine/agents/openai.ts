/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/openai.ts
 *
 * 降级实现：提供 OpenAI 响应归一化，不再抛出 stub 错误。
 */

export function normalizeOpenAIResponsesToolCallIds(messages: any[]): any[] {
  return messages;
}

export function downgradeOpenAIFunctionCallReasoningPairs(messages: any[]): any[] {
  return messages;
}

export function downgradeOpenAIReasoningBlocks(messages: any[]): any[] {
  return messages;
}
