// 移植自 openclaw/src/infra/channel-resolution.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resetOutboundChannelResolutionStateForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: resetOutboundChannelResolutionStateForTest");
}
export function normalizeDeliverableOutboundChannel(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeDeliverableOutboundChannel");
}
export function resolveOutboundChannelPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundChannelPlugin");
}
export function resolveOutboundChannelMessageAdapter(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundChannelMessageAdapter");
}
