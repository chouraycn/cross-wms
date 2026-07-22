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

export const MATTERMOST_CHANNEL_ID = "mattermost" as ChannelId;

interface MattermostAccountConfig {
  serverUrl: string;
  accessToken: string;
  userId?: string;
}

export interface MattermostWebhookResult {
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

let cachedUserId: string | null = null;

async function getUserId(account: MattermostAccountConfig): Promise<string> {
  if (cachedUserId) return cachedUserId;

  try {
    const response = await fetch(`${account.serverUrl}/api/v4/users/me`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    const data = await response.json();
    if (data.id) {
      cachedUserId = data.id;
      return data.id;
    }
  } catch {
  }
  return account.userId || "mattermost-bot";
}

export function createMattermostChannelPlugin(): ChannelPlugin {
  const mattermostChannelMeta: ChannelMeta = {
    id: MATTERMOST_CHANNEL_ID,
    label: "Mattermost",
    selectionLabel: "Mattermost",
    blurb: "Mattermost 团队协作平台",
    docsPath: "/channels/mattermost",
    aliases: ["mattermost", "mm"],
    markdownCapable: true,
  };

  const mattermostChannelCapabilities: ChannelCapabilities = {
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

  const mattermostChannelConfig: ChannelConfigAdapter<MattermostAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const mattermostConfig = config.mattermost as Record<string, unknown>;
      if (mattermostConfig && mattermostConfig.serverUrl && mattermostConfig.accessToken) {
        return [MATTERMOST_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): MattermostAccountConfig | null => {
      if (accountId !== MATTERMOST_CHANNEL_ID) return null;
      const mattermostConfig = config.mattermost as Record<string, unknown>;
      if (mattermostConfig && mattermostConfig.serverUrl && mattermostConfig.accessToken) {
        return {
          serverUrl: String(mattermostConfig.serverUrl),
          accessToken: String(mattermostConfig.accessToken),
          userId: mattermostConfig.userId as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: MattermostAccountConfig): boolean => {
      return !!account.serverUrl && !!account.accessToken;
    },
    isConfigured: (account: MattermostAccountConfig): boolean => {
      return !!account.serverUrl && !!account.accessToken;
    },
  };

  const mattermostChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = mattermostChannelConfig.resolveAccount(
          { mattermost: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Mattermost account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const channelId = ctx.to;
          if (!channelId) {
            return { success: false, error: "Mattermost channel ID not provided" };
          }

          const body: Record<string, unknown> = {
            channel_id: channelId,
            message: text,
          };

          const response = await fetch(`${account.serverUrl}/api/v4/posts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${account.accessToken}`,
            },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const data = await response.json();
            return { success: true, messageId: data.id || `mattermost-${Date.now()}` };
          }
          const errorText = await response.text();
          return { success: false, error: `Mattermost send failed: ${errorText.slice(0, 200)}` };
        } catch (error) {
          return {
            success: false,
            error: `Mattermost send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: MATTERMOST_CHANNEL_ID,
    meta: mattermostChannelMeta,
    capabilities: mattermostChannelCapabilities,
    config: mattermostChannelConfig,
    message: mattermostChannelMessageAdapter,
  });
}

export function parseMattermostWebhook(body: unknown): MattermostWebhookResult {
  const data = body as Record<string, unknown>;

  if (!data.channel_id || !data.text) {
    return { success: false, error: "Invalid Mattermost webhook format" };
  }

  const text = String(data.text || "");
  if (!text) {
    return { success: false, error: "Empty message" };
  }

  const sender = String(data.user_id || data.username || "");
  const channelType = String(data.channel_type || "");
  const isDirect = channelType === "D" || channelType === "direct";

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(data.channel_id || ""),
      userId: sender,
      messageId: String(data.post_id || data.id || ""),
      text,
      timestamp: Number(data.create_at || Date.now()),
      chatType: isDirect ? "direct" : "group",
    },
  };
}