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

export const WECHATWORK_CHANNEL_ID = "wechatwork" as ChannelId;

interface WeChatWorkAccountConfig {
  corpId: string;
  corpSecret: string;
  agentId: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(account: WeChatWorkAccountConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${account.corpId}&corpsecret=${account.corpSecret}`,
    { method: "GET" },
  );

  const data = await response.json();
  if (data.errcode === 0 && data.access_token) {
    cachedAccessToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in - 60) * 1000;
    return cachedAccessToken!;
  }
  throw new Error(`WeChatWork auth failed: ${data.errmsg || "Unknown error"}`);
}

export function createWeChatWorkChannelPlugin(): ChannelPlugin {
  const weChatWorkChannelMeta: ChannelMeta = {
    id: WECHATWORK_CHANNEL_ID,
    label: "企业微信",
    selectionLabel: "企业微信",
    blurb: "企业微信机器人消息通道",
    docsPath: "/channels/wechatwork",
    aliases: ["wechatwork", "wecom"],
    markdownCapable: true,
  };

  const weChatWorkChannelCapabilities: ChannelCapabilities = {
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

  const weChatWorkChannelConfig: ChannelConfigAdapter<WeChatWorkAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const weChatWorkConfig = config.wechatwork as Record<string, unknown>;
      if (weChatWorkConfig && weChatWorkConfig.corpId && weChatWorkConfig.corpSecret) {
        return [WECHATWORK_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): WeChatWorkAccountConfig | null => {
      if (accountId !== WECHATWORK_CHANNEL_ID) return null;
      const weChatWorkConfig = config.wechatwork as Record<string, unknown>;
      if (weChatWorkConfig && weChatWorkConfig.corpId && weChatWorkConfig.corpSecret) {
        return {
          corpId: String(weChatWorkConfig.corpId),
          corpSecret: String(weChatWorkConfig.corpSecret),
          agentId: String(weChatWorkConfig.agentId || ""),
          accessToken: weChatWorkConfig.accessToken as string | undefined,
          accessTokenExpiresAt: weChatWorkConfig.accessTokenExpiresAt as number | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: WeChatWorkAccountConfig): boolean => {
      return !!account.corpId && !!account.corpSecret;
    },
    isConfigured: (account: WeChatWorkAccountConfig): boolean => {
      return !!account.corpId && !!account.corpSecret && !!account.agentId;
    },
  };

  const weChatWorkChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = weChatWorkChannelConfig.resolveAccount(
          { wechatwork: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "WeChatWork account not configured" };
        }

        try {
          const token = await getAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=" + token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              touser: ctx.to,
              agentid: account.agentId,
              msgtype: "text",
              text: { content: text },
            }),
          });

          const data = await response.json();
          if (data.errcode === 0) {
            return { success: true, messageId: String(data.msgid || "") };
          }
          return { success: false, error: `WeChatWork send failed: ${data.errmsg || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `WeChatWork send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: WECHATWORK_CHANNEL_ID,
    meta: weChatWorkChannelMeta,
    capabilities: weChatWorkChannelCapabilities,
    config: weChatWorkChannelConfig,
    message: weChatWorkChannelMessageAdapter,
  });
}