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

export const SLACK_CHANNEL_ID = "slack" as ChannelId;

interface SlackAccountConfig {
  webhookUrl: string;
  token?: string;
  signingSecret?: string;
}

export interface SlackWebhookResult {
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

export function createSlackChannelPlugin(): ChannelPlugin {
  const slackChannelMeta: ChannelMeta = {
    id: SLACK_CHANNEL_ID,
    label: "Slack",
    selectionLabel: "Slack",
    blurb: "Slack 消息通道",
    docsPath: "/channels/slack",
    aliases: ["slack"],
    markdownCapable: true,
  };

  const slackChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: true,
    mentions: true,
    voice: false,
    video: false,
    typing: true,
  };

  const slackChannelConfig: ChannelConfigAdapter<SlackAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const slackConfig = config.slack as Record<string, unknown>;
      if (slackConfig && (slackConfig.webhookUrl || slackConfig.token)) {
        return [SLACK_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): SlackAccountConfig | null => {
      if (accountId !== SLACK_CHANNEL_ID) return null;
      const slackConfig = config.slack as Record<string, unknown>;
      if (slackConfig && (slackConfig.webhookUrl || slackConfig.token)) {
        return {
          webhookUrl: slackConfig.webhookUrl as string | undefined,
          token: slackConfig.token as string | undefined,
          signingSecret: slackConfig.signingSecret as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: SlackAccountConfig): boolean => {
      return !!account.webhookUrl || !!account.token;
    },
    isConfigured: (account: SlackAccountConfig): boolean => {
      return !!account.webhookUrl || !!account.token;
    },
  };

  const slackChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = slackChannelConfig.resolveAccount(
          { slack: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account || !account.webhookUrl) {
          return { success: false, error: "Slack webhook URL not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const body: Record<string, unknown> = {
            text: text.length > 4000 ? text.slice(0, 3997) + "..." : text,
          };

          if (ctx.metadata?.username) {
            body.username = ctx.metadata.username;
          }
          if (ctx.metadata?.icon_url) {
            body.icon_url = ctx.metadata.icon_url;
          }
          if (ctx.metadata?.icon_emoji) {
            body.icon_emoji = ctx.metadata.icon_emoji;
          }
          if (ctx.to) {
            body.channel = ctx.to;
          }

          const response = await fetch(account.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({ ts: Date.now() }));
            return { success: true, messageId: data.ts || data.message?.ts || `slack-${Date.now()}` };
          }
          const errorText = await response.text();
          return { success: false, error: `Slack send failed: ${errorText.slice(0, 200)}` };
        } catch (error) {
          return {
            success: false,
            error: `Slack send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: SLACK_CHANNEL_ID,
    meta: slackChannelMeta,
    capabilities: slackChannelCapabilities,
    config: slackChannelConfig,
    message: slackChannelMessageAdapter,
  });
}

export function parseSlackWebhook(body: unknown, account: SlackAccountConfig): SlackWebhookResult {
  const data = body as Record<string, unknown>;

  const type = String(data.type || "");

  if (type === "url_verification") {
    return { success: true, type: "url_verification" };
  }

  if (type !== "event_callback") {
    return { success: false, error: `Unsupported event type: ${type}` };
  }

  const event = data.event as Record<string, unknown>;
  const eventType = String(event.type || "");

  if (eventType !== "message") {
    return { success: false, error: `Unsupported event: ${eventType}` };
  }

  const text = String(event.text || "");
  if (!text) {
    return { success: false, error: "Empty message" };
  }

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(event.channel || ""),
      userId: String(event.user || ""),
      messageId: String(event.ts || "") + "-" + String(event.channel || ""),
      text,
      timestamp: Number(event.ts || 0) * 1000,
      chatType: String(event.channel_type || "") === "im" ? "direct" : "group",
    },
  };
}