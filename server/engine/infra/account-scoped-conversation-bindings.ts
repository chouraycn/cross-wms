// 移植自 openclaw/src/infra/account-scoped-conversation-bindings.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AccountScopedConversationBindingRecord = unknown;
export type AccountScopedConversationBindingManager = unknown;
export function createAccountScopedConversationBindingManager(...args: unknown[]): unknown {
  throw new Error("not implemented: createAccountScopedConversationBindingManager");
}
export function resetAccountScopedConversationBindingsForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: resetAccountScopedConversationBindingsForTests");
}
