// 移植自 openclaw/src/infra/session-binding-normalization.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConversationRefShape = unknown;
export function normalizeConversationTargetRef(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConversationTargetRef");
}
export function normalizeConversationRef(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConversationRef");
}
export function buildChannelAccountKey(...args: unknown[]): unknown {
  throw new Error("not implemented: buildChannelAccountKey");
}
