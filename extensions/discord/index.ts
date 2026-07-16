/**
 * Discord 渠道扩展入口
 *
 * 实现 ExtensionProvider 接口，注册 Discord 渠道适配器到 cross-wms 渠道注册表。
 * 参考 openclaw/extensions/discord 的架构模式。
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
import { DiscordApi } from "./api.js";

export const DISCORD_CHANNEL_ID = "discord" as ChannelId;

interface DiscordAccountConfig {
  botToken: string;
  applicationId?: string;
  guildId?: string;
}

const manifest: ExtensionManifest = {
  id: "discord",
  name: "Discord Channel",
  description: "Discord Bot API channel extension",
  version: "1.0.0",
  kind: "channel",
  sdkVersion: "1.0.0",
  requiresAuth: true,
  authType: "api-key",
};

const discordChannelMeta: ChannelMeta = {
  id: DISCORD_CHANNEL_ID,
  label: "Discord",
  selectionLabel: "Discord (Bot API)",
  blurb: "Discord 机器人消息通道，支持服务器频道和私信",
  docsPath: "/channels/discord",
  aliases: ["discord", "discord-bot"],
  markdownCapable: true,
};

const discordChannelCapabilities: ChannelCapabilities = {
  chatTypes: ["direct", "group"],
  media: true,
  reactions: true,
  threads: true,
  polls: true,
  mentions: true,
  voice: true,
  video: false,
  typing: true,
};

const discordChannelConfig: ChannelConfigAdapter<DiscordAccountConfig> = {
  listAccountIds: (config: AppConfig): ChannelId[] => {
    const discordConfig = config.discord as Record<string, unknown> | undefined;
    if (discordConfig && discordConfig.botToken) {
      return [DISCORD_CHANNEL_ID];
    }
    return [];
  },
  resolveAccount: (
    config: AppConfig,
    accountId: ChannelId,
  ): DiscordAccountConfig | null => {
    if (accountId !== DISCORD_CHANNEL_ID) return null;
    const discordConfig = config.discord as Record<string, unknown> | undefined;
    if (discordConfig && discordConfig.botToken) {
      return {
        botToken: String(discordConfig.botToken),
        applicationId: discordConfig.applicationId as string | undefined,
        guildId: discordConfig.guildId as string | undefined,
      };
    }
    return null;
  },
  isEnabled: (account: DiscordAccountConfig): boolean => {
    return !!account.botToken;
  },
  isConfigured: (account: DiscordAccountConfig): boolean => {
    return !!account.botToken;
  },
};

function createDiscordChannelPlugin(): ChannelPlugin<DiscordAccountConfig> {
  const messageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = discordChannelConfig.resolveAccount(
          { discord: { botToken: process.env.DISCORD_BOT_TOKEN } } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Discord account not configured" };
        }

        try {
          const api = new DiscordApi(account.botToken);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const result = await api.createMessage(ctx.to, {
            content: text,
          });

          return { success: true, messageId: result.id };
        } catch (error) {
          return {
            success: false,
            error: `Discord send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createChannelPlugin({
    id: DISCORD_CHANNEL_ID,
    meta: discordChannelMeta,
    capabilities: discordChannelCapabilities,
    config: discordChannelConfig,
    message: messageAdapter,
  });
}

export default class DiscordChannelExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info("Registering Discord channel extension");

    const botToken = context.secrets("DISCORD_BOT_TOKEN");
    if (!botToken) {
      context.logger.warn("DISCORD_BOT_TOKEN not found in environment");
    }

    const plugin = createDiscordChannelPlugin();
    const registry = getGlobalChannelRegistry();
    registry.register(plugin);

    context.logger.info("Discord channel plugin registered");
  }

  unregister(): void {
    const registry = getGlobalChannelRegistry();
    registry.unregister(DISCORD_CHANNEL_ID);
    console.log("Unregistered Discord channel extension");
  }
}

export { DiscordApi };
export type {
  DiscordUser,
  DiscordChannel,
  DiscordMessage,
  DiscordAttachment,
  DiscordEmbed,
  DiscordGatewayBot,
};
