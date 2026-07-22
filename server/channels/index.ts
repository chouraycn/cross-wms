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

import {
  createMatrixChannelPlugin,
} from "./builtin-matrix.js";

import {
  createMattermostChannelPlugin,
} from "./builtin-mattermost.js";

import {
  createTelegramChannelPlugin,
} from "./builtin-telegram.js";

import {
  createSignalChannelPlugin,
} from "./builtin-signal.js";

import {
  createWhatsAppChannelPlugin,
} from "./builtin-whatsapp.js";

import {
  createIrcChannelPlugin,
} from "./builtin-irc.js";

import {
  createLineChannelPlugin,
} from "./builtin-line.js";

import {
  createTwitchChannelPlugin,
} from "./builtin-twitch.js";

import {
  createGoogleChatChannelPlugin,
} from "./builtin-googlechat.js";

import {
  createSmsChannelPlugin,
} from "./builtin-sms.js";

import {
  createTlonChannelPlugin,
} from "./builtin-tlon.js";

import {
  createZaloChannelPlugin,
} from "./builtin-zalo.js";

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
  createMatrixChannelPlugin,
  MATRIX_CHANNEL_ID,
  parseMatrixWebhook,
  type MatrixWebhookResult,
} from "./builtin-matrix.js";

export {
  createMattermostChannelPlugin,
  MATTERMOST_CHANNEL_ID,
  parseMattermostWebhook,
  type MattermostWebhookResult,
} from "./builtin-mattermost.js";

export {
  createTelegramChannelPlugin,
  TELEGRAM_CHANNEL_ID,
  parseTelegramUpdate,
  type TelegramWebhookResult,
} from "./builtin-telegram.js";

export {
  createSignalChannelPlugin,
  SIGNAL_CHANNEL_ID,
  parseSignalWebhook,
  type SignalWebhookResult,
} from "./builtin-signal.js";

export {
  createWhatsAppChannelPlugin,
  WHATSAPP_CHANNEL_ID,
  parseWhatsAppWebhook,
  verifyWhatsAppWebhook,
  type WhatsAppWebhookResult,
} from "./builtin-whatsapp.js";

export {
  createIrcChannelPlugin,
  IRC_CHANNEL_ID,
  parseIrcLine,
  closeAllIrcConnections,
  type IrcWebhookResult,
} from "./builtin-irc.js";

export {
  createLineChannelPlugin,
  LINE_CHANNEL_ID,
  parseLineWebhook,
  type LineWebhookResult,
} from "./builtin-line.js";

export {
  createTwitchChannelPlugin,
  TWITCH_CHANNEL_ID,
  parseTwitchIrcLine,
  closeAllTwitchConnections,
  type TwitchWebhookResult,
} from "./builtin-twitch.js";

export {
  createGoogleChatChannelPlugin,
  GOOGLECHAT_CHANNEL_ID,
  parseGoogleChatWebhook,
  type GoogleChatWebhookResult,
} from "./builtin-googlechat.js";

export {
  createSmsChannelPlugin,
  SMS_CHANNEL_ID,
  parseSmsWebhook,
  type SmsWebhookResult,
} from "./builtin-sms.js";

export {
  createTlonChannelPlugin,
  TLON_CHANNEL_ID,
  parseTlonEvent,
  type TlonWebhookResult,
} from "./builtin-tlon.js";

export {
  createZaloChannelPlugin,
  ZALO_CHANNEL_ID,
  parseZaloWebhook,
  verifyZaloWebhook,
  type ZaloWebhookResult,
} from "./builtin-zalo.js";

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
  if (!registry.has("matrix" as never)) {
    registry.register(createMatrixChannelPlugin());
  }
  if (!registry.has("mattermost" as never)) {
    registry.register(createMattermostChannelPlugin());
  }
  if (!registry.has("telegram" as never)) {
    registry.register(createTelegramChannelPlugin());
  }
  if (!registry.has("signal" as never)) {
    registry.register(createSignalChannelPlugin());
  }
  if (!registry.has("whatsapp" as never)) {
    registry.register(createWhatsAppChannelPlugin());
  }
  if (!registry.has("irc" as never)) {
    registry.register(createIrcChannelPlugin());
  }
  if (!registry.has("line" as never)) {
    registry.register(createLineChannelPlugin());
  }
  if (!registry.has("twitch" as never)) {
    registry.register(createTwitchChannelPlugin());
  }
  if (!registry.has("googlechat" as never)) {
    registry.register(createGoogleChatChannelPlugin());
  }
  if (!registry.has("sms" as never)) {
    registry.register(createSmsChannelPlugin());
  }
  if (!registry.has("tlon" as never)) {
    registry.register(createTlonChannelPlugin());
  }
  if (!registry.has("zalo" as never)) {
    registry.register(createZaloChannelPlugin());
  }
}
