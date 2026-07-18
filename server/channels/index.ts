/**
 * Channel types barrel export.
 */

import {
  getGlobalChannelRegistry,
} from "./registry.js";

import {
  createWebChannelPlugin,
} from "./builtin.js";

import {
  createFeishuChannelPlugin,
} from "./builtin-feishu.js";

import {
  createWeComChannelPlugin,
} from "./builtin-wecom.js";

import {
  createDingTalkChannelPlugin,
} from "./builtin-dingtalk.js";

export type {
  ChannelId,
  AccountId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
  ChannelStatus,
  Channel,
  ChannelMessage,
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

export {
  createWebChannelPlugin,
  createBuiltinChannelPlugin,
  WEB_CHANNEL_ID,
} from "./builtin.js";

export {
  createFeishuChannelPlugin,
  FEISHU_CHANNEL_ID,
  parseFeishuWebhook,
  type FeishuWebhookResult,
} from "./builtin-feishu.js";

export {
  createWeComChannelPlugin,
  WECOM_CHANNEL_ID,
  parseWeComWebhook,
  type WeComWebhookResult,
} from "./builtin-wecom.js";

export {
  createDingTalkChannelPlugin,
  DINGTALK_CHANNEL_ID,
  parseDingTalkWebhook,
  type DingTalkWebhookResult,
} from "./builtin-dingtalk.js";

export {
  TypingIndicator,
  TypingCallbacks,
  type TypingCallback,
} from "./typing.js";

export {
  PairingStore,
} from "./pairingStore.js";

export {
  InboundReplyPipeline,
  InboundReplyPipelineError,
  type PipelineStage,
  type PipelineStageFn,
  type MentionGatingConfig,
  type ThreadBindingConfig,
  type PrefixRoutingConfig,
  type InboundReplyPipelineConfig,
} from "./inboundReplyPipeline.js";

export {
  ChannelManager,
} from "./channelManager.js";

/**
 * 注册所有内置通道插件到全局注册表
 */
export function registerBuiltinChannels(): void {
  const registry = getGlobalChannelRegistry();

  if (!registry.has("web" as never)) {
    registry.register(createWebChannelPlugin());
  }
  if (!registry.has("feishu" as never)) {
    registry.register(createFeishuChannelPlugin());
  }
  if (!registry.has("wecom" as never)) {
    registry.register(createWeComChannelPlugin());
  }
  if (!registry.has("dingtalk" as never)) {
    registry.register(createDingTalkChannelPlugin());
  }
}
