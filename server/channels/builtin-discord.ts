import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";
import type { MessageSendContext, ChannelMessageSendResult } from "./message/types.js";
import { createBuiltinChannelPlugin } from "./builtin.js";
import type { ChannelPlugin } from "./plugin.js";

export const DISCORD_CHANNEL_ID = "discord" as ChannelId;

interface DiscordAccountConfig {
  webhookUrl: string;
  token?: string;
}

export interface DiscordWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  error?: string;
}

export function createDiscordChannelPlugin(): ChannelPlugin {
  const discordChannelMeta: ChannelMeta = {
    id: DISCORD_CHANNEL_ID,
    label: "Discord",
    selectionLabel: "Discord",
    blurb: "Discord 消息通道",
    docsPath: "/channels/discord",
    aliases: ["discord"],
    markdownCapable: true,
  };

  const discordChannelCapabilities: ChannelCapabilities = {
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

  const discordChannelConfig: ChannelConfigAdapter<DiscordAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const discordConfig = config.discord as Record<string, unknown>;
      if (discordConfig && (discordConfig.webhookUrl || discordConfig.token)) {
        return [DISCORD_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): DiscordAccountConfig | null => {
      if (accountId !== DISCORD_CHANNEL_ID) return null;
      const discordConfig = config.discord as Record<string, unknown>;
      if (discordConfig && (discordConfig.webhookUrl || discordConfig.token)) {
        return {
          webhookUrl: discordConfig.webhookUrl as string,
          token: discordConfig.token as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: DiscordAccountConfig): boolean => {
      return !!account.webhookUrl || !!account.token;
    },
    isConfigured: (account: DiscordAccountConfig): boolean => {
      return !!account.webhookUrl || !!account.token;
    },
  };

  const discordChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = discordChannelConfig.resolveAccount(
          { discord: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account || !account.webhookUrl) {
          return { success: false, error: "Discord webhook URL not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const body: Record<string, unknown> = {
            content: text.length > 2000 ? text.slice(0, 1997) + "..." : text,
          };

          if (ctx.metadata?.username) {
            body.username = ctx.metadata.username;
          }
          if (ctx.metadata?.avatar_url) {
            body.avatar_url = ctx.metadata.avatar_url;
          }

          const response = await fetch(account.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({ id: `discord-${Date.now()}` }));
            return { success: true, messageId: data.id || `discord-${Date.now()}` };
          }
          const errorText = await response.text();
          return { success: false, error: `Discord send failed: ${errorText.slice(0, 200)}` };
        } catch (error) {
          return {
            success: false,
            error: `Discord send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: DISCORD_CHANNEL_ID,
    meta: discordChannelMeta,
    capabilities: discordChannelCapabilities,
    config: discordChannelConfig,
    message: discordChannelMessageAdapter,
  });
}

export function parseDiscordWebhook(body: unknown): DiscordWebhookResult {
  const data = body as Record<string, unknown>;

  if (!data.type || data.type !== 1) {
    return { success: false, error: "Unsupported webhook type" };
  }

  const message = data as Record<string, unknown>;
  const author = message.author as Record<string, unknown>;

  if (!message.content && !message.embeds) {
    return { success: false, error: "Missing content" };
  }

  let text = String(message.content || "");
  const embeds = message.embeds as Array<Record<string, unknown>> || [];
  if (embeds.length > 0) {
    embeds.forEach(embed => {
      if (embed.description) text += "\n" + String(embed.description);
      if (embed.title) text = String(embed.title) + "\n" + text;
    });
  }

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(message.channel_id || ""),
      userId: String(author?.id || ""),
      messageId: String(message.id || ""),
      text,
      timestamp: new Date(String(message.timestamp || Date.now())).getTime(),
      chatType: String(message.channel_type || "") === "dm" ? "direct" : "group",
    },
  };
}