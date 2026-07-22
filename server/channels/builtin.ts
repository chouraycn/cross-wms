/**
 * Built-in channel plugin factories.
 *
 * Provides factory functions for creating built-in channel plugins like Web channel.
 */
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";
import type {
  MessageSendContext,
} from "./message/types.js";
import type { ChannelStatusAdapter } from "./plugin.js";
import { createChannelPlugin } from "./registry.js";
import type { ChannelPlugin } from "./plugin.js";

/**
 * Parameters for creating a built-in channel plugin.
 */
export interface CreateBuiltinChannelPluginParams {
  /** Channel id */
  id: ChannelId;
  /** Channel metadata */
  meta: ChannelMeta;
  /** Channel capabilities */
  capabilities: ChannelCapabilities;
  /** Channel config adapter */
  config: ChannelConfigAdapter;
  /** Optional message adapter */
  message?: ChannelPlugin["message"];
  /** Optional status adapter */
  status?: ChannelPlugin["status"];
}

/**
 * Creates a built-in channel plugin with the provided parameters.
 */
export function createBuiltinChannelPlugin(
  params: CreateBuiltinChannelPluginParams,
): ChannelPlugin {
  return createChannelPlugin({
    id: params.id,
    meta: params.meta,
    capabilities: params.capabilities,
    config: params.config,
    message: params.message,
    status: params.status,
  });
}

/**
 * Web channel id constant.
 */
export const WEB_CHANNEL_ID = "web" as ChannelId;

/**
 * Creates the Web channel plugin.
 *
 * The Web channel is a built-in channel that handles web-based interactions.
 */
export function createWebChannelPlugin(): ChannelPlugin {
  const webChannelMeta: ChannelMeta = {
    id: WEB_CHANNEL_ID,
    label: "Web",
    selectionLabel: "Web",
    blurb: "Web-based chat interface",
    docsPath: "/channels/web",
    aliases: ["web", "webchat", "web-chat"],
    markdownCapable: true,
  };

  const webChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: true,
  };

  const webChannelConfig: ChannelConfigAdapter = {
    listAccountIds: (_config: AppConfig): ChannelId[] => {
      return [WEB_CHANNEL_ID];
    },
    resolveAccount: (_config: AppConfig, accountId: ChannelId) => {
      if (accountId === WEB_CHANNEL_ID) {
        return accountId as any;
      }
      return null;
    },
    isEnabled: (_account: any, _config: AppConfig): boolean => {
      return true;
    },
    isConfigured: (_account: any, _config: AppConfig): boolean => {
      return true;
    },
  };

  const webChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (_ctx: MessageSendContext) => {
        // Web channel send implementation would go here
        return {
          success: true,
          messageId: `web-${Date.now()}`,
        };
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: WEB_CHANNEL_ID,
    meta: webChannelMeta,
    capabilities: webChannelCapabilities,
    config: webChannelConfig,
    message: webChannelMessageAdapter,
  });
}

export { createFeishuChannelPlugin, FEISHU_CHANNEL_ID } from "./builtin-feishu.js";
export { createWeComChannelPlugin, WECOM_CHANNEL_ID } from "./builtin-wecom.js";
export { createDingTalkChannelPlugin, DINGTALK_CHANNEL_ID } from "./builtin-dingtalk.js";
export { createWeChatWorkChannelPlugin, WECHATWORK_CHANNEL_ID } from "./builtin-wechatwork.js";
export { createWeChatChannelPlugin, WECHAT_CHANNEL_ID } from "./builtin-wechat.js";
export { createQQChannelPlugin, QQ_CHANNEL_ID } from "./builtin-qq.js";
export { createDiscordChannelPlugin, DISCORD_CHANNEL_ID } from "./builtin-discord.js";
export { createSlackChannelPlugin, SLACK_CHANNEL_ID } from "./builtin-slack.js";
export { createMatrixChannelPlugin, MATRIX_CHANNEL_ID } from "./builtin-matrix.js";
export { createNostrChannelPlugin, NOSTR_CHANNEL_ID } from "./builtin-nostr.js";
export { createMsTeamsChannelPlugin, MSTEAMS_CHANNEL_ID } from "./builtin-msteams.js";
