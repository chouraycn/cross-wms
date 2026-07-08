/**
 * Feishu Channel Plugin
 * 飞书通道 - API 适配、消息收发、认证流程
 *
 * 飞书开放平台文档: https://open.feishu.cn/document
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

export const FEISHU_CHANNEL_ID = "feishu" as ChannelId;

interface FeishuAccountConfig {
  appId: string;
  appSecret: string;
  tenantAccessToken?: string;
  accessTokenExpiresAt?: number;
  verificationToken?: string;
  encryptKey?: string;
}

/** 飞书 webhook 事件解析结果 */
export interface FeishuWebhookResult {
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

async function getTenantAccessToken(account: FeishuAccountConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: account.appId,
      app_secret: account.appSecret,
    }),
  });

  const data = await response.json();
  if (data.code === 0 && data.tenant_access_token) {
    cachedAccessToken = data.tenant_access_token;
    tokenExpiresAt = now + (data.expire - 60) * 1000;
    return cachedAccessToken!;
  }
  throw new Error(`Feishu auth failed: ${data.msg || "Unknown error"}`);
}

export function createFeishuChannelPlugin(): ChannelPlugin {
  const feishuChannelMeta: ChannelMeta = {
    id: FEISHU_CHANNEL_ID,
    label: "飞书",
    selectionLabel: "飞书",
    blurb: "飞书机器人消息通道",
    docsPath: "/channels/feishu",
    aliases: ["feishu", "lark"],
    markdownCapable: true,
  };

  const feishuChannelCapabilities: ChannelCapabilities = {
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

  const feishuChannelConfig: ChannelConfigAdapter<FeishuAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const feishuConfig = config.feishu as Record<string, unknown>;
      if (feishuConfig && feishuConfig.appId && feishuConfig.appSecret) {
        return [FEISHU_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): FeishuAccountConfig | null => {
      if (accountId !== FEISHU_CHANNEL_ID) return null;
      const feishuConfig = config.feishu as Record<string, unknown>;
      if (feishuConfig && feishuConfig.appId && feishuConfig.appSecret) {
        return {
          appId: String(feishuConfig.appId),
          appSecret: String(feishuConfig.appSecret),
          tenantAccessToken: feishuConfig.tenantAccessToken as string | undefined,
          accessTokenExpiresAt: feishuConfig.accessTokenExpiresAt as number | undefined,
          verificationToken: feishuConfig.verificationToken as string | undefined,
          encryptKey: feishuConfig.encryptKey as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: FeishuAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
    isConfigured: (account: FeishuAccountConfig): boolean => {
      return !!account.appId && !!account.appSecret;
    },
  };

  const feishuChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = feishuChannelConfig.resolveAccount(
          { feishu: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Feishu account not configured" };
        }

        try {
          const token = await getTenantAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              receive_id_type: "chat_id",
              receive_id: ctx.to,
              content: JSON.stringify({ text }),
              msg_type: "text",
            }),
          });

          const data = await response.json();
          if (data.code === 0 && data.data?.message_id) {
            return { success: true, messageId: data.data.message_id };
          }
          return { success: false, error: `Feishu send failed: ${data.msg || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `Feishu send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: FEISHU_CHANNEL_ID,
    meta: feishuChannelMeta,
    capabilities: feishuChannelCapabilities,
    config: feishuChannelConfig,
    message: feishuChannelMessageAdapter,
  });
}

/**
 * 解析飞书 webhook 事件（独立函数，供 webhook 路由调用）
 */
export function parseFeishuWebhook(body: unknown, account: FeishuAccountConfig): FeishuWebhookResult {
  const data = body as Record<string, unknown>;

  // 验证 verificationToken
  if (account.verificationToken) {
    const token = data.token as string;
    if (token !== account.verificationToken) {
      return { success: false, error: "Invalid verification token" };
    }
  }

  // URL 验证挑战
  if (data.type === "url_verification" && data.challenge) {
    return { success: true, type: "url_verification" };
  }

  const type = String(data.type || "");
  const event = data.event as Record<string, unknown>;

  if (type === "message" && event) {
    const message = event.message as Record<string, unknown>;
    const sender = event.sender as Record<string, unknown>;
    const chat = event.chat as Record<string, unknown>;

    if (!message) return { success: false, error: "Missing message field" };

    let text = "";
    try {
      const content = String(message.content || "");
      text = JSON.parse(content).text || "";
    } catch {
      text = String(message.content || "");
    }

    return {
      success: true,
      type: "message",
      message: {
        chatId: String(chat?.chat_id || ""),
        userId: (() => {
          const senderId = sender?.sender_id as Record<string, unknown> || {};
          return String(senderId.user_id || senderId.open_id || "");
        })(),
        messageId: String(message.message_id || ""),
        text,
        timestamp: Number(message.create_time) * 1000,
        chatType: String(chat?.chat_type || "") === "p2p" ? "direct" : "group",
      },
    };
  }

  return { success: false, error: `Unsupported event type: ${type}` };
}
