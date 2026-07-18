/**
 * * Types for plugin-requested bindings to external channel conversations.
 * 移植自 openclaw/src/plugins/conversation-binding.types.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginConversationBindingRequestParams = unknown;

export type PluginConversationBindingResolutionDecision = unknown;

export type PluginConversationBinding = unknown;

export type PluginConversationBindingRequestResult = unknown;

export type PluginConversationBindingResolvedEvent = unknown;

