/**
 * WeCom Channel Plugin
 * 企业微信通道 - API 适配、消息收发、认证流程
 *
 * 企业微信开放平台文档: https://developer.work.weixin.qq.com
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

export const WECOM_CHANNEL_ID = "wecom" as ChannelId;

interface WeComAccountConfig {
  corpId: string;
  corpSecret: string;
  agentId: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  token?: string;
  encodingAesKey?: string;
}

/** 企业微信 webhook 事件解析结果 */
export interface WeComWebhookResult {
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

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(account: WeComAccountConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${account.corpId}&corpsecret=${account.corpSecret}`,
  );
  const data = await response.json();
  if (data.errcode === 0 && data.access_token) {
    cachedAccessToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in - 60) * 1000;
    return cachedAccessToken!;
  }
  throw new Error(`WeCom auth failed: ${data.errmsg || "Unknown error"}`);
}

export function createWeComChannelPlugin(): ChannelPlugin {
  const wecomChannelMeta: ChannelMeta = {
    id: WECOM_CHANNEL_ID,
    label: "企业微信",
    selectionLabel: "企业微信",
    blurb: "企业微信机器人消息通道",
    docsPath: "/channels/wecom",
    aliases: ["wecom", "workweixin", "wxwork"],
    markdownCapable: true,
  };

  const wecomChannelCapabilities: ChannelCapabilities = {
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

  const wecomChannelConfig: ChannelConfigAdapter<WeComAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const wecomConfig = config.wecom as Record<string, unknown>;
      if (wecomConfig && wecomConfig.corpId && wecomConfig.corpSecret && wecomConfig.agentId) {
        return [WECOM_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): WeComAccountConfig | null => {
      if (accountId !== WECOM_CHANNEL_ID) return null;
      const wecomConfig = config.wecom as Record<string, unknown>;
      if (wecomConfig && wecomConfig.corpId && wecomConfig.corpSecret && wecomConfig.agentId) {
        return {
          corpId: String(wecomConfig.corpId),
          corpSecret: String(wecomConfig.corpSecret),
          agentId: String(wecomConfig.agentId),
          accessToken: wecomConfig.accessToken as string | undefined,
          accessTokenExpiresAt: wecomConfig.accessTokenExpiresAt as number | undefined,
          token: wecomConfig.token as string | undefined,
          encodingAesKey: wecomConfig.encodingAesKey as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: WeComAccountConfig): boolean => {
      return !!account.corpId && !!account.corpSecret && !!account.agentId;
    },
    isConfigured: (account: WeComAccountConfig): boolean => {
      return !!account.corpId && !!account.corpSecret && !!account.agentId;
    },
  };

  const wecomChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = wecomChannelConfig.resolveAccount(
          { wecom: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "WeCom account not configured" };
        }

        try {
          const token = await getAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://qyapi.weixin.qq.com/cgi-bin/message/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              touser: ctx.to,
              msgtype: "text",
              agentid: account.agentId,
              text: { content: text },
            }),
          });

          const data = await response.json();
          if (data.errcode === 0) {
            return { success: true, messageId: data.msgid };
          }
          return { success: false, error: `WeCom send failed: ${data.errmsg || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `WeCom send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: WECOM_CHANNEL_ID,
    meta: wecomChannelMeta,
    capabilities: wecomChannelCapabilities,
    config: wecomChannelConfig,
    message: wecomChannelMessageAdapter,
  });
}

/**
 * 解析企业微信 webhook 事件（独立函数，供 webhook 路由调用）
 */
export function parseWeComWebhook(body: unknown, _account: WeComAccountConfig): WeComWebhookResult {
  const data = body as Record<string, unknown>;
  const msgType = String(data.MsgType || "");

  if (msgType === "text") {
    const isGroup = !!data.ChatId;

    return {
      success: true,
      type: "message",
      message: {
        chatId: String(data.ChatId || data.ToUserName || ""),
        userId: String(data.FromUserName || ""),
        messageId: String(data.MsgId || data.MsgId64 || ""),
        text: String(data.Content || ""),
        timestamp: Number(data.CreateTime) * 1000,
        chatType: isGroup ? "group" : "direct",
      },
    };
  }

  return { success: false, error: `Unsupported message type: ${msgType}` };
}
