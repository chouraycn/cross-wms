// 移植自 openclaw/src/channels/plugins/session-conversation.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ResolvedSessionConversation = unknown;

export type ResolvedSessionConversationRef = unknown;

export function resolveSessionConversation(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveSessionConversation");
}

export function resolveSessionConversationRef(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveSessionConversationRef");
}

export function resolveSessionThreadInfo(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveSessionThreadInfo");
}

export function resolveSessionParentSessionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveSessionParentSessionKey");
}
