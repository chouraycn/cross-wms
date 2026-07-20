/**
 * WeChat Channel Plugin
 * 微信个人号通道 - API 适配、消息收发、认证流程
 *
 * 微信开放平台文档: https://developers.weixin.qq.com
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

export const WECHAT_CHANNEL_ID = "wechat" as ChannelId;

interface WeChatAccountConfig {
  appId: string;
  appSecret: string;
  token?: string;
  encodingAesKey?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
}

let cachedAccessToken: Map<string, string> = new Map();
let tokenExpiresMap: Map<string, number> = new Map();

async function getAccessToken(account: WeChatAccountConfig): Promise<string> {
  const now = Date.now();
  const cacheKey = `${account.appId}_${account.appSecret}`;
  const cached = cachedAccessToken.get(cacheKey);
  const expiresAt = tokenExpiresMap.get(cacheKey) || 0;

  if (cached && now < expiresAt) {
    return cached;
  }

  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appId}&secret=${account.appSecret}`,
  );
  const data = await response.json();
  if (data.access_token) {
    cachedAccessToken.set(cacheKey, data.access_token);
    tokenExpiresMap.set(cacheKey, now + (data.expires_in - 60) * 1000);
    return data.access_token;
  }
  throw new Error(`WeChat auth failed: ${data.errmsg || "Unknown error"}`);
}

export function createWeChatChannelPlugin(): ChannelPlugin {
  const wechatChannelMeta: ChannelMeta = {
    id: WECHAT_CHANNEL_ID,
    label: "微信",
    selectionLabel: "微信",
    blurb: "微信个人号消息通道",
    docsPath: "/channels/wechat",
    aliases: ["wechat", "weixin", "wx"],
    markdownCapable: true,
  };

  const wechatChannelCapabilities: ChannelCapabilities = {
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

  const wechatChannelConfig: ChannelConfigAdapter<WeChatAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const wechatConfig = config.wechat as Record<string, unknown>;
      if (wechatConfig && wechatConfig.appId && wechatConfig.appSecret) {
        return [WECHAT_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): WeChatAccountConfig | null => {
      if (accountId !== WECHAT_CHANNEL_ID) return null;
      const wechatConfig = config.wechat as Record<string, unknown>;
      if (wechatConfig && wechatConfig.appId && wechatConfig.appSecret) {
        return {
          appId: String(wechatConfig.appId),
          appSecret: String(wechatConfig.appSecret),
          token: wechatConfig.token as string | undefined,
          encodingAesKey: wechatConfig.encodingAesKey as string | undefined,
          accessToken: wechatConfig.accessToken as string | undefined,
          accessTokenExpiresAt: wechatConfig.accessTokenExpiresAt as number | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: WeChatAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
    isConfigured: (account: WeChatAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
  };

  const wechatChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = wechatChannelConfig.resolveAccount(
          { wechat: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "WeChat account not configured" };
        }

        try {
          const token = await getAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://api.weixin.qq.com/cgi-bin/message/custom/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              touser: ctx.to,
              msgtype: "text",
              text: { content: text },
            }),
          });

          const data = await response.json();
          if (data.errcode === 0) {
            return { success: true, messageId: data.msgid };
          }
          return { success: false, error: `WeChat send failed: ${data.errmsg || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `WeChat send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: WECHAT_CHANNEL_ID,
    meta: wechatChannelMeta,
    capabilities: wechatChannelCapabilities,
    config: wechatChannelConfig,
    message: wechatChannelMessageAdapter,
  });
}

export interface WeChatWebhookResult {
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

export function parseWeChatWebhook(body: unknown, _account: WeChatAccountConfig): WeChatWebhookResult {
  const data = body as Record<string, unknown>;
  const msgType = String(data.MsgType || "");

  if (msgType === "text") {
    const isGroup = !!data.ToUserName && !data.ToUserName.startsWith("gh_");

    return {
      success: true,
      type: "message",
      message: {
        chatId: String(data.ToUserName || ""),
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