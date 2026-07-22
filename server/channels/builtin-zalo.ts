/**
 * Zalo 内置渠道插件
 *
 * 基于 Zalo Bot API 实现消息通道：
 * - API 端点：https://bot-api.zaloplatforms.com/bot{token}/{method}
 * - 支持 sendMessage、sendPhoto、getUpdates（长轮询）、setWebhook
 * - Webhook 事件包含 event_name 和 message 字段
 * - 使用 secret_token 验证 webhook 请求
 *
 * @see https://bot.zaloplatforms.com/docs
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

export const ZALO_CHANNEL_ID = "zalo" as ChannelId;

/** Zalo Bot API 基础 URL */
const ZALO_API_BASE = "https://bot-api.zaloplatforms.com";

/** Zalo 消息文本长度限制 */
const ZALO_TEXT_LIMIT = 2000;

/** Zalo 账户配置 */
export interface ZaloAccountConfig {
  /** Bot Token（从 Zalo Bot 平台获取） */
  botToken: string;
  /** Webhook 密钥（用于验证入站请求） */
  webhookSecret?: string;
  /** API 根 URL（默认 https://bot-api.zaloplatforms.com） */
  apiRoot?: string;
}

/** Zalo API 响应 */
export interface ZaloApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

/** Zalo 消息对象 */
export interface ZaloMessage {
  message_id: string;
  from: {
    id: string;
    name?: string;
    display_name?: string;
    avatar?: string;
    is_bot?: boolean;
  };
  chat: {
    id: string;
    chat_type: "PRIVATE" | "GROUP";
  };
  date: number;
  text?: string;
  photo_url?: string;
  caption?: string;
  message_type?: string;
}

/** Zalo webhook 入站解析结果 */
export interface ZaloWebhookResult {
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

/**
 * 调用 Zalo Bot API。
 *
 * POST {apiRoot}/bot{token}/{method}
 */
export async function callZaloApi<T = unknown>(
  method: string,
  botToken: string,
  body?: Record<string, unknown>,
  options?: { apiRoot?: string; timeoutMs?: number },
): Promise<ZaloApiResponse<T>> {
  const apiRoot = options?.apiRoot || ZALO_API_BASE;
  const url = `${apiRoot.replace(/\/$/, "")}/bot${botToken}/${method}`;

  const controller = new AbortController();
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = (await response.json()) as ZaloApiResponse<T>;
    return data;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * 发送 Zalo 文本消息。
 */
export async function sendZaloMessage(
  account: ZaloAccountConfig,
  chatId: string,
  text: string,
): Promise<{ messageId: string }> {
  const response = await callZaloApi<{ message_id: string }>(
    "sendMessage",
    account.botToken,
    {
      chat_id: chatId,
      text: text.slice(0, ZALO_TEXT_LIMIT),
    },
    { apiRoot: account.apiRoot },
  );

  if (!response.ok || !response.result) {
    throw new Error(
      `Zalo sendMessage failed: ${response.description || `error_code ${response.error_code}`}`,
    );
  }

  return { messageId: response.result.message_id };
}

/**
 * 发送 Zalo 图片消息。
 */
export async function sendZaloPhoto(
  account: ZaloAccountConfig,
  chatId: string,
  photoUrl: string,
  caption?: string,
): Promise<{ messageId: string }> {
  const response = await callZaloApi<{ message_id: string }>(
    "sendPhoto",
    account.botToken,
    {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption?.slice(0, ZALO_TEXT_LIMIT),
    },
    { apiRoot: account.apiRoot },
  );

  if (!response.ok || !response.result) {
    throw new Error(
      `Zalo sendPhoto failed: ${response.description || `error_code ${response.error_code}`}`,
    );
  }

  return { messageId: response.result.message_id };
}

/**
 * 设置 Zalo Webhook URL。
 */
export async function setZaloWebhook(
  account: ZaloAccountConfig,
  webhookUrl: string,
  secretToken: string,
): Promise<void> {
  const response = await callZaloApi(
    "setWebhook",
    account.botToken,
    {
      url: webhookUrl,
      secret_token: secretToken,
    },
    { apiRoot: account.apiRoot },
  );

  if (!response.ok) {
    throw new Error(
      `Zalo setWebhook failed: ${response.description || `error_code ${response.error_code}`}`,
    );
  }
}

/**
 * 通过长轮询获取 Zalo 更新（开发/测试用）。
 */
export async function getZaloUpdates(
  account: ZaloAccountConfig,
  timeoutSec = 30,
): Promise<ZaloMessage | null> {
  const response = await callZaloApi<ZaloMessage>(
    "getUpdates",
    account.botToken,
    { timeout: String(timeoutSec) },
    { apiRoot: account.apiRoot, timeoutMs: (timeoutSec + 5) * 1000 },
  );

  if (!response.ok) {
    // 408 是长轮询超时（无更新），不是错误
    if (response.error_code === 408) {
      return null;
    }
    throw new Error(
      `Zalo getUpdates failed: ${response.description || `error_code ${response.error_code}`}`,
    );
  }

  return response.result || null;
}

export function createZaloChannelPlugin(): ChannelPlugin {
  const zaloMeta: ChannelMeta = {
    id: ZALO_CHANNEL_ID,
    label: "Zalo",
    selectionLabel: "Zalo",
    blurb: "Zalo 消息通道",
    docsPath: "/channels/zalo",
    aliases: ["zalo"],
    markdownCapable: true,
  };

  const zaloCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: false,
    video: false,
    typing: true,
  };

  const zaloConfig: ChannelConfigAdapter<ZaloAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const zaloConfig = config.zalo as Record<string, unknown>;
      if (zaloConfig && zaloConfig.botToken) {
        return [ZALO_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): ZaloAccountConfig | null => {
      if (accountId !== ZALO_CHANNEL_ID) return null;
      const zaloConfig = config.zalo as Record<string, unknown>;
      if (zaloConfig && zaloConfig.botToken) {
        return {
          botToken: String(zaloConfig.botToken),
          webhookSecret: zaloConfig.webhookSecret as string | undefined,
          apiRoot: zaloConfig.apiRoot as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: ZaloAccountConfig): boolean => {
      return !!account.botToken;
    },
    isConfigured: (account: ZaloAccountConfig): boolean => {
      return !!account.botToken;
    },
  };

  const zaloMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = zaloConfig.resolveAccount(
          { zalo: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Zalo account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          if (!ctx.to) {
            return { success: false, error: "Zalo chat_id not provided" };
          }

          // 支持 mediaUrl：当 metadata 中包含 photoUrl 时发送图片
          const photoUrl = ctx.metadata?.photoUrl as string | undefined;
          if (photoUrl) {
            const result = await sendZaloPhoto(account, ctx.to, photoUrl, text);
            return { success: true, messageId: result.messageId };
          }

          const result = await sendZaloMessage(account, ctx.to, text);
          return { success: true, messageId: result.messageId };
        } catch (error) {
          return {
            success: false,
            error: `Zalo send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: ZALO_CHANNEL_ID,
    meta: zaloMeta,
    capabilities: zaloCapabilities,
    config: zaloConfig,
    message: zaloMessageAdapter,
  });
}

/**
 * 解析 Zalo Webhook 入站事件。
 *
 * Zalo 通过 webhook POST 事件到指定 URL，格式为：
 * { event_name: "message.text.received", message: { ... } }
 */
export function parseZaloWebhook(body: unknown): ZaloWebhookResult {
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid Zalo webhook payload" };
  }

  const eventName = String(data.event_name || "");

  // 支持的事件类型
  const supportedEvents = [
    "message.text.received",
    "message.image.received",
    "message.sticker.received",
    "message.unsupported.received",
  ];

  if (!supportedEvents.includes(eventName)) {
    return { success: false, error: `Unsupported event: ${eventName}` };
  }

  const message = data.message as Record<string, unknown> | undefined;
  if (!message) {
    return { success: false, error: "No message in webhook payload" };
  }

  // 提取文本内容
  const text = String(message.text || message.caption || "");
  if (!text && eventName !== "message.image.received" && eventName !== "message.sticker.received") {
    return { success: false, error: "Empty message text" };
  }

  const from = message.from as Record<string, unknown> | undefined;
  const chat = message.chat as Record<string, unknown> | undefined;
  const chatType = String(chat?.chat_type || "PRIVATE");

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(chat?.id || ""),
      userId: String(from?.id || ""),
      messageId: String(message.message_id || ""),
      text: text || (message.photo_url ? "[图片]" : "[贴纸]"),
      timestamp: Number(message.date || Date.now()) * 1000,
      chatType: chatType === "GROUP" ? "group" : "direct",
    },
  };
}

/**
 * 验证 Zalo Webhook 请求的密钥。
 *
 * Zalo 通过 header 中的 X-Zalo-Secret-Token 或 query 参数 secret_token 验证。
 */
export function verifyZaloWebhook(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | string[] | undefined>,
  expectedSecret: string,
): boolean {
  if (!expectedSecret) {
    return true; // 未配置密钥时跳过验证
  }

  const headerToken = headers["x-zalo-secret-token"];
  const headerTokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (headerTokenStr) {
    return headerTokenStr === expectedSecret;
  }

  const queryToken = query["secret_token"];
  const queryTokenStr = Array.isArray(queryToken) ? queryToken[0] : queryToken;
  if (queryTokenStr) {
    return queryTokenStr === expectedSecret;
  }

  return false;
}
