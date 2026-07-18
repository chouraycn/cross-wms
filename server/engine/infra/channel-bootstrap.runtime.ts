// 移植自 openclaw/src/infra/channel-bootstrap.runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resetOutboundChannelBootstrapStateForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: resetOutboundChannelBootstrapStateForTests");
}
export function bootstrapOutboundChannelPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: bootstrapOutboundChannelPlugin");
}
