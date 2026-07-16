/**
 * Telegram 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Telegram 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/telegram 的架构模式。
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
import { TelegramApi } from "./api.js";

export const TELEGRAM_CHANNEL_ID = "telegram" as ChannelId;

interface TelegramAccountConfig {
  botToken: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

const manifest: ExtensionManifest = {
  id: "telegram",
  name: "Telegram Channel",
  description: "Telegram Bot API channel extension",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const telegramChannelMeta: ChannelMeta = {
  id: TELEGRAM_CHANNEL_ID,
  label: "Telegram",
  selectionLabel: "Telegram (Bot API)",
  blurb: "Telegram Bot 消息通道，通过 @BotFather 注册机器人即可使用",
  docsPath: "/channels/telegram",
  aliases: ["telegram", "tg", "telegram-bot"],
  markdownCapable: true,
};

const telegramChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: true,
  reactions: true,
  threads: true,
  polls: true,
  mentions: true,
  voice: true,
  video: true,
  typing: true,
};

const telegramChannelConfig: ChannelConfigAdapter<TelegramAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const telegramConfig = config.telegram as Record<string, unknown> | undefined;
    if (telegramConfig && telegramConfig.botToken) {
      return [TELEGRAM_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): TelegramAccountConfig | null => {
    if (accountId !== TELEGRAM_CHANNEL_ID) return null;
    const telegramConfig = config.telegram as Record<string, unknown> | undefined;
    if (telegramConfig && telegramConfig.botToken) {
      return {
        botToken: String(telegramConfig.botToken),
        webhookUrl: telegramConfig.webhookUrl as string | undefined,
        webhookSecret: telegramConfig.webhookSecret as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: TelegramAccountConfig): boolean => {
    return !!account.botToken;
  },
  isConfigured: (account: TelegramAccountConfig): boolean => {
    return !!account.botToken;
  },
};

function createTelegramChannelPlugin(): ChannelPlugin<TelegramAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = telegramChannelConfig.resolveAccount(
          { telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Telegram account not configured" };
        }

        try {
          const api = new TelegramApi(account.botToken);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await api.sendMessage(ctx.to, text, {
            parseMode: "MarkdownV2",
            messageThreadId: ctx.accountId ? Number(ctx.accountId) : undefined,
          });

          return { success: true, messageId: String(result.message_id) };
        } catch (error) {
          return {
            success: false,
            error: `Telegram send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: TELEGRAM_CHANNEL_ID,
    meta: telegramChannelMeta,
    capabilities: telegramChannelCapabilities,
    config: telegramChannelConfig,
    message: messageAdapter,
  });
}

export default class TelegramChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Telegram channel extension");

    const botToken = context.secrets("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      context.logger.warn("TELEGRAM_BOT_TOKEN not found in environment");
    }

    const plugin = createTelegramChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Telegram channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(TELEGRAM_CHANNEL_ID);
    console.log("Unregistered Telegram channel extension");
  }
}

export { TelegramApi };
export type {
  TelegramBotInfo,
  TelegramMessage,
  TelegramUpdate,
  TelegramSendMessageResult,
};
