/**
 * Thread binding id 解析 — 从 account 前缀的 binding id 解析出 conversation id
 *
 * 参考 openclaw/src/channels/thread-binding-id.ts
 */
import { normalizeOptionalString } from "../infra/string-coerce.js";

/** 从 account 前缀的 binding id 解析出 conversation id */
export function resolveThreadBindingConversationIdFromBindingId(params: {
  accountId: string;
  bindingId?: string;
}): string | undefined {
  const bindingId = normalizeOptionalString(params.bindingId);
  if (!bindingId) {
    return undefined;
  }
  const prefix = `${params.accountId}:`;
  if (!bindingId.startsWith(prefix)) {
    return undefined;
  }
  const conversationId = normalizeOptionalString(bindingId.slice(prefix.length));
  return conversationId || undefined;
}
