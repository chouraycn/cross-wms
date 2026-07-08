/**
 * ACP Conversation ID
 * 对话标识符 - 规范化 ACP 对话标识符
 *
 * 参考 openclaw/src/acp/conversation-id.ts 设计
 */

export function normalizeConversationText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `${value}`.trim();
  }
  return "";
}