// 移植自 openclaw/src/channels/plugins/thread-binding-api.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveBundledChannelThreadBindingDefaultPlacement(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledChannelThreadBindingDefaultPlacement");
}

export function resolveBundledChannelThreadBindingInboundConversation(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledChannelThreadBindingInboundConversation");
}
