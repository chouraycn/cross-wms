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
import { createHmac } from "node:crypto";

export const DINGTALK_CHANNEL_ID = "dingtalk" as ChannelId;

interface DingTalkAccountConfig {
  appKey: string;
  appSecret: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  /** 事件订阅「签名 Token」，用于校验回调签名（可选，配置后启用严格校验） */
  token?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(account: DingTalkAccountConfig): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: account.appKey,
      appSecret: account.appSecret,
    }),
  });

  const data = await response.json();
  if (data.accessToken) {
    cachedAccessToken = data.accessToken;
    tokenExpiresAt = now + (data.expireIn - 60) * 1000;
    return cachedAccessToken!;
  }
  throw new Error(`DingTalk auth failed: ${data.message || "Unknown error"}`);
}

export function createDingTalkChannelPlugin(): ChannelPlugin {
  const dingTalkChannelMeta: ChannelMeta = {
    id: DINGTALK_CHANNEL_ID,
    label: "钉钉",
    selectionLabel: "钉钉",
    blurb: "钉钉机器人消息通道",
    docsPath: "/channels/dingtalk",
    aliases: ["dingtalk", "ding"],
    markdownCapable: true,
  };

  const dingTalkChannelCapabilities: ChannelCapabilities = {
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

  const dingTalkChannelConfig: ChannelConfigAdapter<DingTalkAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const dingTalkConfig = config.dingtalk as Record<string, unknown>;
      if (dingTalkConfig && dingTalkConfig.appKey && dingTalkConfig.appSecret) {
        return [DINGTALK_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): DingTalkAccountConfig | null => {
      if (accountId !== DINGTALK_CHANNEL_ID) return null;
      const dingTalkConfig = config.dingtalk as Record<string, unknown>;
      if (dingTalkConfig && dingTalkConfig.appKey && dingTalkConfig.appSecret) {
        return {
          appKey: String(dingTalkConfig.appKey),
          appSecret: String(dingTalkConfig.appSecret),
          accessToken: dingTalkConfig.accessToken as string | undefined,
          accessTokenExpiresAt: dingTalkConfig.accessTokenExpiresAt as number | undefined,
          token: dingTalkConfig.token as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: DingTalkAccountConfig): boolean => {
      return !!account.appKey && !!account.appSecret;
    },
    isConfigured: (account: DingTalkAccountConfig): boolean => {
      return !!account.appKey && !!account.appSecret;
    },
  };

  const dingTalkChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = dingTalkChannelConfig.resolveAccount(
          { dingtalk: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "DingTalk account not configured" };
        }

        try {
          const token = await getAccessToken(account);
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const response = await fetch("https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-acs-dingtalk-access-token": token,
            },
            body: JSON.stringify({
              robotCode: account.appKey,
              userIds: [ctx.to],
              msgParam: JSON.stringify({
                msgtype: "text",
                text: { content: text },
              }),
            }),
          });

          const data = await response.json();
          if (data.success) {
            return { success: true, messageId: String(data.result?.taskId || "") };
          }
          return { success: false, error: `DingTalk send failed: ${data.message || "Unknown error"}` };
        } catch (error) {
          return {
            success: false,
            error: `DingTalk send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: DINGTALK_CHANNEL_ID,
    meta: dingTalkChannelMeta,
    capabilities: dingTalkChannelCapabilities,
    config: dingTalkChannelConfig,
    message: dingTalkChannelMessageAdapter,
  });
}

/** 钉钉 webhook 事件解析结果 */
export interface DingTalkWebhookResult {
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

/** 校验钉钉事件订阅回调签名：Base64(HmacSHA256(nonce + timestamp + msg, token)) */
function verifyDingTalkSignature(
  token: string,
  nonce: string,
  timestamp: string,
  msg: string,
  signature: string,
): boolean {
  const base = nonce + timestamp + msg;
  const expected = createHmac("sha256", token).update(base).digest("base64");
  return expected === signature;
}

/**
 * 解析钉钉 webhook 事件（独立函数，供 webhook 路由调用）。
 *
 * 钉钉回调两种形态：
 *  A) 事件订阅包裹：{ msg, timeStamp, nonce }（msg 为 JSON 字符串或明文，未加密时直接是消息体）
 *  B) 已解包的直接消息体：{ msgtype, content, senderId, conversationId, ... }
 *
 * 配置签名 Token 后会严格校验回调签名；未配置则放行（与 feishu/wecom 的宽松策略保持一致）。
 */
export function parseDingTalkWebhook(
  body: unknown,
  account: DingTalkAccountConfig,
  options?: { signature?: string; timestamp?: string; nonce?: string },
): DingTalkWebhookResult {
  const data = (body ?? {}) as Record<string, unknown>;
  const msgField = data.msg;
  const timeStamp = String(options?.timestamp ?? data.timeStamp ?? "");
  const nonce = String(options?.nonce ?? data.nonce ?? "");

  // 签名校验（配置了 token 时）
  if (account.token && options?.signature) {
    const rawMsg = typeof msgField === "string" ? msgField : JSON.stringify(msgField ?? "");
    if (!verifyDingTalkSignature(account.token, nonce, timeStamp, rawMsg, options.signature)) {
      return { success: false, error: "Invalid DingTalk signature" };
    }
  }

  // 尝试解析包裹层 msg（JSON 字符串或对象）
  const tryParseMsg = (): Record<string, unknown> | null => {
    if (typeof msgField === "string" && msgField.trim().startsWith("{")) {
      try {
        return JSON.parse(msgField) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (msgField && typeof msgField === "object") return msgField as Record<string, unknown>;
    return null;
  };

  const parsedMsg = tryParseMsg();

  // URL 验证（check_url）
  if (parsedMsg?.eventType === "check_url" || data.eventType === "check_url") {
    return { success: true, type: "url_verification" };
  }

  // 形态 A：包裹层内是消息事件（机器人接收消息格式）
  if (parsedMsg) {
    const msgtype = String(parsedMsg.msgtype || "");
    const content = parsedMsg.content as Record<string, unknown> | undefined;
    const text = content ? String(content.text || "") : String(parsedMsg.text || "");
    if (msgtype === "text" || (text && msgtype === "")) {
      const isGroup = String(parsedMsg.conversationType) === "2";
      const messageId = String(parsedMsg.msgId || "");
      if (messageId) {
        return {
          success: true,
          type: "message",
          message: {
            chatId: String(parsedMsg.conversationId || parsedMsg.chatId || ""),
            userId: String(parsedMsg.senderId || parsedMsg.senderStaffId || ""),
            messageId,
            text,
            timestamp: Number(parsedMsg.createAt || parsedMsg.createTime || Date.now()),
            chatType: isGroup ? "group" : "direct",
          },
        };
      }
    }
  }

  // 形态 B：已解包的直接消息体
  const msgtypeB = String(data.msgtype || "");
  const contentB = data.content as Record<string, unknown> | undefined;
  const textB = contentB ? String(contentB.text || "") : String(data.text || "");
  const messageIdB = String(data.msgId || "");
  if ((msgtypeB === "text" || contentB) && messageIdB) {
    const isGroupB = String(data.conversationType) === "2";
    return {
      success: true,
      type: "message",
      message: {
        chatId: String(data.conversationId || data.chatId || ""),
        userId: String(data.senderId || data.senderStaffId || ""),
        messageId: messageIdB,
        text: textB,
        timestamp: Number(data.createAt || data.createTime || Date.now()),
        chatType: isGroupB ? "group" : "direct",
      },
    };
  }

  return { success: false, error: "Unsupported DingTalk event" };
}