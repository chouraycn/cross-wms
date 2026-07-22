/**
 * WhatsApp 内置渠道插件
 *
 * 基于 WhatsApp Cloud API（Meta Graph API）实现消息收发：
 * - 通过 Meta Graph API 发送文本/媒体消息
 * - 支持 Webhook 接收入站消息
 * - 需要配置 WhatsApp Business 账户与访问令牌
 *
 * 参考 OpenClaw extensions/whatsapp 的 API 模式。
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

export const WHATSAPP_CHANNEL_ID = "whatsapp" as ChannelId;

/** WhatsApp Cloud API 默认端点 */
const WHATSAPP_API_BASE = "https://graph.facebook.com";
/** WhatsApp Cloud API 版本 */
const WHATSAPP_API_VERSION = "v18.0";
/** WhatsApp 单条消息文本上限 */
const WHATSAPP_TEXT_LIMIT = 4096;

interface WhatsAppAccountConfig {
  /** WhatsApp Business 电话号码 ID */
  phoneNumberId: string;
  /** Meta 访问令牌 */
  accessToken: string;
  /** Webhook 验证令牌（用于验证 Webhook 回调） */
  verifyToken?: string;
  /** 自定义 API 版本 */
  apiVersion?: string;
}

export interface WhatsAppWebhookResult {
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

/** 构建 WhatsApp Cloud API 端点 URL */
function buildApiUrl(account: WhatsAppAccountConfig, suffix: string): string {
  const version = account.apiVersion?.trim() || WHATSAPP_API_VERSION;
  return `${WHATSAPP_API_BASE}/${version}/${suffix}`;
}

export function createWhatsAppChannelPlugin(): ChannelPlugin {
  const whatsappMeta: ChannelMeta = {
    id: WHATSAPP_CHANNEL_ID,
    label: "WhatsApp",
    selectionLabel: "WhatsApp",
    blurb: "WhatsApp Cloud API 消息通道（Meta Graph API）",
    docsPath: "/channels/whatsapp",
    aliases: ["whatsapp", "wa"],
    markdownCapable: false,
  };

  const whatsappCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: true,
    video: true,
    typing: false,
  };

  const whatsappConfig: ChannelConfigAdapter<WhatsAppAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const waConfig = config.whatsapp as Record<string, unknown> | undefined;
      if (waConfig && waConfig.phoneNumberId && waConfig.accessToken) {
        return [WHATSAPP_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): WhatsAppAccountConfig | null => {
      if (accountId !== WHATSAPP_CHANNEL_ID) return null;
      const waConfig = config.whatsapp as Record<string, unknown> | undefined;
      if (waConfig && waConfig.phoneNumberId && waConfig.accessToken) {
        return {
          phoneNumberId: String(waConfig.phoneNumberId),
          accessToken: String(waConfig.accessToken),
          verifyToken: waConfig.verifyToken as string | undefined,
          apiVersion: waConfig.apiVersion as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: WhatsAppAccountConfig): boolean => {
      return !!account.phoneNumberId && !!account.accessToken;
    },
    isConfigured: (account: WhatsAppAccountConfig): boolean => {
      return !!account.phoneNumberId && !!account.accessToken;
    },
  };

  const whatsappMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = whatsappConfig.resolveAccount(
          { whatsapp: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "WhatsApp account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const recipient = ctx.to;
          if (!recipient) {
            return { success: false, error: "WhatsApp recipient not provided" };
          }

          const body: Record<string, unknown> = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient,
            type: "text",
            text: {
              body: text.length > WHATSAPP_TEXT_LIMIT
                ? text.slice(0, WHATSAPP_TEXT_LIMIT - 3) + "..."
                : text,
              preview_url: true,
            },
          };

          const response = await fetch(
            buildApiUrl(account, `${account.phoneNumberId}/messages`),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${account.accessToken}`,
              },
              body: JSON.stringify(body),
            },
          );

          if (response.ok) {
            const data = (await response.json()) as {
              messages?: Array<{ id?: string }>;
            };
            const messageId = data.messages?.[0]?.id || `whatsapp-${Date.now()}`;
            return { success: true, messageId };
          }
          const errorText = await response.text();
          return {
            success: false,
            error: `WhatsApp send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `WhatsApp send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: WHATSAPP_CHANNEL_ID,
    meta: whatsappMeta,
    capabilities: whatsappCapabilities,
    config: whatsappConfig,
    message: whatsappMessageAdapter,
  });
}

/**
 * 解析 WhatsApp Cloud API Webhook 收到的入站消息。
 *
 * Meta 在收到用户消息时会向配置的 Webhook URL POST JSON 载荷。
 * 同时也支持 Webhook 验证（GET 请求的 hub.challenge）。
 */
export function parseWhatsAppWebhook(body: unknown): WhatsAppWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid WhatsApp webhook payload" };
  }

  const entry = data.entry as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(entry) || entry.length === 0) {
    return { success: false, error: "No entry in WhatsApp webhook payload" };
  }

  const firstEntry = entry[0];
  const changes = firstEntry?.changes as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(changes) || changes.length === 0) {
    return { success: false, error: "No changes in WhatsApp webhook entry" };
  }

  const value = changes[0]?.value as Record<string, unknown> | undefined;
  if (!value) {
    return { success: false, error: "No value in WhatsApp webhook change" };
  }

  const messages = value.messages as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    // 可能是状态更新等其他事件，非消息
    return { success: false, error: "No messages in WhatsApp webhook value" };
  }

  const msg = messages[0];
  const textBody = msg.text as Record<string, unknown> | undefined;
  const text = String(textBody?.body || "");
  if (!text) {
    return { success: false, error: "Empty message text" };
  }

  const from = String(msg.from || "");
  const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
  const contactName = contacts?.[0]?.wa_id ? String(contacts[0].wa_id) : from;

  return {
    success: true,
    type: "message",
    message: {
      channelId: from,
      userId: from,
      messageId: String(msg.id || ""),
      text,
      timestamp: Number(msg.timestamp || 0) * 1000,
      chatType: "direct",
    },
  };
}

/**
 * 验证 WhatsApp Webhook 注册（Meta GET 验证）。
 *
 * @param queryParams  查询参数对象
 * @param verifyToken  配置的验证令牌
 * @returns 需要回传的 hub.challenge 值，或 null 表示验证失败
 */
export function verifyWhatsAppWebhook(
  queryParams: Record<string, string | string[] | undefined>,
  verifyToken: string,
): string | null {
  const modeRaw = queryParams["hub.mode"];
  const tokenRaw = queryParams["hub.verify_token"];
  const challengeRaw = queryParams["hub.challenge"];

  const mode = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const challenge = Array.isArray(challengeRaw) ? challengeRaw[0] : challengeRaw;

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}
