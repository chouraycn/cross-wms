/**
 * * Helpers for binding interactive plugin handlers to conversations and sessions.
 * 移植自 openclaw/src/plugins/interactive-binding-helpers.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function createInteractiveConversationBindingHelpers(...args: unknown[]): unknown {
  throw new Error("not implemented: createInteractiveConversationBindingHelpers");
}

