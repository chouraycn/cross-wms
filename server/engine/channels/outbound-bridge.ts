// 移植自 openclaw/src/channels/message/outbound-bridge.ts
// 降级：channel plugin 依赖简化

export type ChannelMessageOutboundBridgeResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export type ChannelMessageOutboundBridgeAdapter = {
  send: (params: unknown) => Promise<ChannelMessageOutboundBridgeResult>;
  update?: (params: unknown) => Promise<ChannelMessageOutboundBridgeResult>;
  delete?: (params: unknown) => Promise<{ ok: boolean }>;
};

export type CreateChannelMessageAdapterFromOutboundParams = {
  channel: string;
  cfg?: unknown;
  outboundAdapter?: unknown;
};

/** Creates a channel message adapter from an outbound bridge. Simplified without real channel plugin. */
export function createChannelMessageAdapterFromOutbound(
  _params: CreateChannelMessageAdapterFromOutboundParams,
): ChannelMessageOutboundBridgeAdapter | null {
  return null;
}
