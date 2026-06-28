/**
 * Channel types barrel export.
 */
export type {
  ChannelId,
  AccountId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";

export type {
  MessageDurability,
  RenderedMessagePartKind,
  RenderedMessagePart,
  RenderedMessageBatch,
  MessageSendContext,
  MessageReceiveAckPolicy,
  MessageReceiveAckState,
  LiveMessageState,
  MessageReceiveContext,
  ChannelMessageSendAdapter,
  ChannelMessageReceiveAdapter,
  ChannelStreamingAdapter,
} from "./message/types.js";

export type {
  ChannelConfigSchema,
  ChannelAuthAdapter,
  ChannelSecurityAdapter,
  ChannelProbeResult,
  ChannelAuditInfo,
  ChannelStatusAdapter,
  ChannelLifecycleAdapter,
  ChannelAgentTool,
  ChannelAgentToolFactory,
  ChannelPlugin,
} from "./plugin.js";

export type {
  ChannelRegistry,
} from "./registry.js";

export {
  InMemoryChannelRegistry,
  getGlobalChannelRegistry,
  getChannelRegistry,
  setGlobalChannelRegistry,
  createChannelPlugin,
  type CreateChannelPluginParams,
} from "./registry.js";
