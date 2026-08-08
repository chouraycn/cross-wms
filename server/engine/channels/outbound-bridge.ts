// 移植自 openclaw/src/channels/message/outbound-bridge.ts
// 降级：channel plugin 依赖简化

export type ChannelMessageOutboundBridgeResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export type ChannelMessageOutboundBridgeAdapter = {
  send: (params: any) => Promise<ChannelMessageOutboundBridgeResult>;
  update?: (params: any) => Promise<ChannelMessageOutboundBridgeResult>;
  delete?: (params: any) => Promise<{ ok: boolean }>;
};

export type CreateChannelMessageAdapterFromOutboundParams = {
  channel: string;
  cfg?: any;
  outboundAdapter?: any;
};

/** Creates a channel message adapter from an outbound bridge. Simplified without real channel plugin. */
export function createChannelMessageAdapterFromOutbound(
  _params: CreateChannelMessageAdapterFromOutboundParams,
): ChannelMessageOutboundBridgeAdapter | null {
  return null;
}
