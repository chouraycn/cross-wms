/**
 * QQ 机器人渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 QQ 机器人渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/qqbot 的架构模式。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from "../extension-types.js";
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
  ChannelPlugin,
} from "../../server/channels/types.js";
import type {
  MessageSendContext,
  ChannelMessageSendResult,
} from "../../server/channels/message/types.js";
import { createChannelPlugin, getGlobalChannelRegistry } from "../../server/channels/registry.js";
import { createQQBotChannel, type QQBotConfig } from "./api.js";

export const QQBOT_CHANNEL_ID = "qqbot" as ChannelId;

interface QQBotAccountConfig extends QQBotConfig {}

const manifest: ExtensionManifest = {
  id: "qqbot",
  name: "QQ Bot Channel",
  description: "QQ Official Bot API channel extension for Tencent QQ",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const qqbotChannelMeta: ChannelMeta = {
  id: QQBOT_CHANNEL_ID,
  label: "QQ 机器人",
  selectionLabel: "QQ 机器人 (Official API)",
  blurb: "腾讯 QQ 官方机器人消息通道，支持频道、群聊和私信",
  docsPath: "/channels/qqbot",
  aliases: ["qq", "qqbot", "qq-bot"],
  markdownCapable: false,
};

const qqbotChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: true,
  reactions: false,
  threads: false,
  polls: false,
  mentions: true,
  voice: false,
  video: false,
  typing: false,
};

const qqbotChannelConfig: ChannelConfigAdapter<QQBotAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const qqbotConfig = config.qqbot as Record<string, unknown> | undefined;
    if (qqbotConfig && qqbotConfig.appId && qqbotConfig.clientSecret) {
      return [QQBOT_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): QQBotAccountConfig | null => {
    if (accountId !== QQBOT_CHANNEL_ID) return null;
    const qqbotConfig = config.qqbot as Record<string, unknown> | undefined;
    if (qqbotConfig && qqbotConfig.appId && qqbotConfig.clientSecret) {
      return {
        appId: String(qqbotConfig.appId),
        clientSecret: String(qqbotConfig.clientSecret),
        sandbox: qqbotConfig.sandbox as boolean | undefined,
        apiBase: qqbotConfig.apiBase as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: QQBotAccountConfig): boolean => {
    return !!account.appId && !!account.clientSecret;
  },
  isConfigured: (account: QQBotAccountConfig): boolean => {
    return !!account.appId && !!account.clientSecret;
  },
};

function createQQBotChannelPlugin(): ChannelPlugin<QQBotAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = qqbotChannelConfig.resolveAccount(
          { qqbot: { appId: process.env.QQBOT_APP_ID, clientSecret: process.env.QQBOT_CLIENT_SECRET } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "QQ Bot account not configured" };
        }

        try {
          const qqbot = createQQBotChannel(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const isDirect = ctx.to.startsWith("user:") || !ctx.to.includes(":");
          const targetId = ctx.to.replace(/^(user:|channel:|group:)/, "");

          let result;
          if (isDirect) {
            result = await qqbot.sendPrivateMessage(targetId, text);
          } else {
            result = await qqbot.sendMessage(targetId, text);
          }

          return { success: true, messageId: result.id };
        } catch (error) {
          return {
            success: false,
            error: `QQ Bot send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: QQBOT_CHANNEL_ID,
    meta: qqbotChannelMeta,
    capabilities: qqbotChannelCapabilities,
    config: qqbotChannelConfig,
    message: messageAdapter,
  });
}

export default class QQBotChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering QQ Bot channel extension");

    const appId = context.secrets("QQBOT_APP_ID");
    const clientSecret = context.secrets("QQBOT_CLIENT_SECRET");
    if (!appId || !clientSecret) {
      context.logger.warn("QQBOT_APP_ID / QQBOT_CLIENT_SECRET not found in environment");
    }

    const plugin = createQQBotChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("QQ Bot channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(QQBOT_CHANNEL_ID);
    console.log("Unregistered QQ Bot channel extension");
  }
}

export { createQQBotChannel };
export type {
  QQBotConfig,
  QQBotChannel,
  QQMessage,
  QQSendMessageResult,
} from "./api.js";
