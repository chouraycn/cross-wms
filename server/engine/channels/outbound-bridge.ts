// 移植自 openclaw/src/channels/message/outbound-bridge.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelMessageOutboundBridgeResult = unknown;

export type ChannelMessageOutboundBridgeAdapter = unknown;

export type CreateChannelMessageAdapterFromOutboundParams = unknown;

export function createChannelMessageAdapterFromOutbound(..._args: unknown[]): unknown {
  throw new Error("not implemented: createChannelMessageAdapterFromOutbound");
}
