/**
 * Binds plugin conversations to stable channel and agent identifiers.
 * 移植自 openclaw/src/plugins/conversation-binding.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function isPluginOwnedBindingMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginOwnedBindingMetadata");
}

export function isPluginOwnedSessionBindingRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginOwnedSessionBindingRecord");
}

export function toPluginConversationBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: toPluginConversationBinding");
}

export function buildPluginBindingUnavailableText(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginBindingUnavailableText");
}

export function buildPluginBindingDeclinedText(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginBindingDeclinedText");
}

export function buildPluginBindingErrorText(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginBindingErrorText");
}

export function hasShownPluginBindingFallbackNotice(...args: unknown[]): unknown {
  throw new Error("not implemented: hasShownPluginBindingFallbackNotice");
}

export function markPluginBindingFallbackNoticeShown(...args: unknown[]): unknown {
  throw new Error("not implemented: markPluginBindingFallbackNoticeShown");
}

export function buildPluginBindingApprovalCustomId(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginBindingApprovalCustomId");
}

export function parsePluginBindingApprovalCustomId(...args: unknown[]): unknown {
  throw new Error("not implemented: parsePluginBindingApprovalCustomId");
}





export function buildPluginBindingResolvedText(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginBindingResolvedText");
}

const testing: unknown = undefined;
export { testing as __testing_conversation_binding };


