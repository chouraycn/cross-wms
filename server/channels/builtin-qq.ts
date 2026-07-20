/**
 * QQ Channel Plugin
 * QQ 机器人通道 - API 适配、消息收发、认证流程
 *
 * QQ 开放平台文档: https://q.qq.com
 */

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

export const QQ_CHANNEL_ID = "qq" as ChannelId;

interface QQAccountConfig {
  appId: string;
  appSecret: string;
  botToken?: string;
  token?: string;
  tokenExpiresAt?: number;
}

let cachedToken: Map<string, string> = new Map();
let tokenExpiresMap: Map<string, number> = new Map();

async function getBotToken(account: QQAccountConfig): Promise<string> {
  const now = Date.now();
  const cacheKey = `${account.appId}_${account.appSecret}`;
  const cached = cachedToken.get(cacheKey);
  const expiresAt = tokenExpiresMap.get(cacheKey) || 0;

  if (cached && now < expiresAt) {
    return cached;
  }

  const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: account.appId,
      clientSecret: account.appSecret,
    }),
  });
  const data = await response.json();
  if (data.access_token) {
    cachedToken.set(cacheKey, data.access_token);
    tokenExpiresMap.set(cacheKey, now + (data.expires_in - 60) * 1000);
    return data.access_token;
  }
  throw new Error(`QQ auth failed: ${data.errmsg || "Unknown error"}`);
}

export function createQQChannelPlugin(): ChannelPlugin {
  const qqChannelMeta: ChannelMeta = {
    id: QQ_CHANNEL_ID,
    label: "QQ",
    selectionLabel: "QQ",
    blurb: "QQ 机器人消息通道",
    docsPath: "/channels/qq",
    aliases: ["qq", "qqbot", "qq-bot"],
    markdownCapable: true,
  };

  const qqChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: false,
    mentions: true,
    voice: false,
    video: false,
    typing: false,
  };

  const qqChannelConfig: ChannelConfigAdapter<QQAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const qqConfig = config.qq as Record<string, unknown>;
      if (qqConfig && qqConfig.appId && qqConfig.appSecret) {
        return [QQ_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): QQAccountConfig | null => {
      if (accountId !== QQ_CHANNEL_ID) return null;
      const qqConfig = config.qq as Record<string, unknown>;
      if (qqConfig && qqConfig.appId && qqConfig.appSecret) {
        return {
          appId: String(qqConfig.appId),
          appSecret: String(qqConfig.appSecret),
          botToken: qqConfig.botToken as string | undefined,
          token: qqConfig.token as string | undefined,
          tokenExpiresAt: qqConfig.tokenExpiresAt as number | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: QQAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
    isConfigured: (account: QQAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
  };

  const qqChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = qqChannelConfig.resolveAccount(
          { qq: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "QQ account not configured" };
        }

        try {
          const token = await getBotToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://api.sgroup.qq.com/users/@me/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bot ${account.appId}.${token}`,
            },
            body: JSON.stringify({
              content: text,
              msg_type: 0,
            }),
          });

          const data = await response.json();
          if (data.code === 0) {
            return { success: true, messageId: data.id };
          }
          return { success: false, error: `QQ send failed: ${data.message || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `QQ send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: QQ_CHANNEL_ID,
    meta: qqChannelMeta,
    capabilities: qqChannelCapabilities,
    config: qqChannelConfig,
    message: qqChannelMessageAdapter,
  });
}

export interface QQWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    chatId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  error?: string;
}

export function parseQQWebhook(body: unknown, _account: QQAccountConfig): QQWebhookResult {
  const data = body as Record<string, unknown>;
  const msgType = String(data.msg_type || data.type || "");

  if (msgType === "0" || msgType === "text") {
    const isGroup = !!data.group_id || !!data.guild_id;

    return {
      success: true,
      type: "message",
      message: {
        chatId: String(data.group_id || data.guild_id || data.channel_id || ""),
        userId: String(data.author?.id || data.user_id || ""),
        messageId: String(data.id || data.msg_id || ""),
        text: String(data.content || ""),
        timestamp: Number(data.timestamp || Date.now()),
        chatType: isGroup ? "group" : "direct",
      },
    };
  }

  return { success: false, error: `Unsupported message type: ${msgType}` };
}