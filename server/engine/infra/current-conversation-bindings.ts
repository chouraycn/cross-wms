// 移植自 openclaw/src/infra/current-conversation-bindings.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getGenericCurrentConversationBindingCapabilities(...args: unknown[]): unknown {
  throw new Error("not implemented: getGenericCurrentConversationBindingCapabilities");
}
export function bindGenericCurrentConversation(...args: unknown[]): unknown {
  throw new Error("not implemented: bindGenericCurrentConversation");
}
export function resolveGenericCurrentConversationBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGenericCurrentConversationBinding");
}
export function listGenericCurrentConversationBindingsBySession(...args: unknown[]): unknown {
  throw new Error("not implemented: listGenericCurrentConversationBindingsBySession");
}
export function touchGenericCurrentConversationBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: touchGenericCurrentConversationBinding");
}
export function unbindGenericCurrentConversationBindings(...args: unknown[]): unknown {
  throw new Error("not implemented: unbindGenericCurrentConversationBindings");
}
export const testing_current_conversation_bindings: unknown = undefined;
export type __testing_current_conversation_bindings = unknown;
