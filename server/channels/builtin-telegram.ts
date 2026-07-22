/**
 * Telegram 内置渠道插件
 *
 * 基于 Telegram Bot API 实现消息收发：
 * - 通过 Bot Token 调用 sendMessage 等 API
 * - 支持长轮询（getUpdates）或 Webhook 接收消息
 * - 支持 Markdown / HTML 格式消息
 *
 * 参考 OpenClaw extensions/telegram 的 API 模式，使用直接 fetch 调用 Bot API。
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

export const TELEGRAM_CHANNEL_ID = "telegram" as ChannelId;

/** Telegram Bot API 默认端点 */
const TELEGRAM_API_BASE = "https://api.telegram.org";
/** Telegram 单条消息文本上限 */
const TELEGRAM_TEXT_LIMIT = 4096;

interface TelegramAccountConfig {
  /** Bot Token（从 @BotFather 获取） */
  botToken: string;
  /** 自定义 API 端点（用于代理或自建 API） */
  apiRoot?: string;
}

export interface TelegramWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
    threadId?: string;
  };
  error?: string;
}

/** 构建 Telegram Bot API 端点 URL */
function buildApiUrl(account: TelegramAccountConfig, method: string): string {
  const base = account.apiRoot?.trim() || TELEGRAM_API_BASE;
  return `${base}/bot${account.botToken}/${method}`;
}

/** 将文本按 Telegram 消息长度上限切分 */
function splitTelegramText(text: string, limit: number = TELEGRAM_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + limit;
    // 避免 UTF-16 代理对被截断
    if (end < text.length) {
      const high = text.charCodeAt(end - 1);
      const low = text.charCodeAt(end);
      if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) {
        end -= 1;
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

export function createTelegramChannelPlugin(): ChannelPlugin {
  const telegramMeta: ChannelMeta = {
    id: TELEGRAM_CHANNEL_ID,
    label: "Telegram",
    selectionLabel: "Telegram",
    blurb: "Telegram Bot 消息通道",
    docsPath: "/channels/telegram",
    aliases: ["telegram", "tg"],
    markdownCapable: true,
  };

  const telegramCapabilities: ChannelCapabilities = {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: true,
    polls: true,
    mentions: true,
    voice: true,
    video: true,
    typing: true,
  };

  const telegramConfig: ChannelConfigAdapter<TelegramAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const tgConfig = config.telegram as Record<string, unknown> | undefined;
      if (tgConfig && tgConfig.botToken) {
        return [TELEGRAM_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (
      config: AppConfig,
      accountId: ChannelId,
    ): TelegramAccountConfig | null => {
      if (accountId !== TELEGRAM_CHANNEL_ID) return null;
      const tgConfig = config.telegram as Record<string, unknown> | undefined;
      if (tgConfig && tgConfig.botToken) {
        return {
          botToken: String(tgConfig.botToken),
          apiRoot: tgConfig.apiRoot as string | undefined,
        };
      }
      return null;
    },
    isEnabled: (account: TelegramAccountConfig): boolean => {
      return !!account.botToken;
    },
    isConfigured: (account: TelegramAccountConfig): boolean => {
      return !!account.botToken;
    },
  };

  const telegramMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = telegramConfig.resolveAccount(
          { telegram: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Telegram bot token not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const chatId = ctx.to;
          if (!chatId) {
            return { success: false, error: "Telegram chat ID not provided" };
          }

          const chunks = splitTelegramText(text);
          let lastMessageId = "";

          for (const chunk of chunks) {
            const body: Record<string, unknown> = {
              chat_id: chatId,
              text: chunk,
            };

            const parseMode = ctx.metadata?.parseMode as string | undefined;
            if (parseMode) {
              body.parse_mode = parseMode;
            }

            const replyTo = ctx.metadata?.replyToMessageId as number | undefined;
            if (replyTo) {
              body.reply_to_message_id = replyTo;
            }

            const threadId = ctx.metadata?.messageThreadId as number | undefined;
            if (threadId) {
              body.message_thread_id = threadId;
            }

            if (ctx.metadata?.disableNotification) {
              body.disable_notification = true;
            }

            const response = await fetch(buildApiUrl(account, "sendMessage"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              const errorText = await response.text();
              return {
                success: false,
                error: `Telegram send failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
              };
            }

            const data = (await response.json()) as {
              ok: boolean;
              result?: { message_id?: number };
            };
            if (data.result?.message_id) {
              lastMessageId = String(data.result.message_id);
            }
          }

          return {
            success: true,
            messageId: lastMessageId || `telegram-${Date.now()}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Telegram send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: TELEGRAM_CHANNEL_ID,
    meta: telegramMeta,
    capabilities: telegramCapabilities,
    config: telegramConfig,
    message: telegramMessageAdapter,
  });
}

/**
 * 解析 Telegram Webhook / getUpdates 收到的 Update 对象。
 *
 * 支持 message、channel_post、edited_message 等更新类型。
 */
export function parseTelegramUpdate(body: unknown): TelegramWebhookResult {
  const data = body as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    return { success: false, error: "Invalid Telegram update payload" };
  }

  const updateId = data.update_id;
  const message =
    (data.message as Record<string, unknown> | undefined) ??
    (data.channel_post as Record<string, unknown> | undefined) ??
    (data.edited_message as Record<string, unknown> | undefined);

  if (!message) {
    return { success: false, error: "No message in Telegram update" };
  }

  const text = String(message.text || message.caption || "");
  if (!text) {
    return { success: false, error: "Empty message text" };
  }

  const chat = message.chat as Record<string, unknown> | undefined;
  const from = message.from as Record<string, unknown> | undefined;
  const chatType = String(chat?.type || "");

  return {
    success: true,
    type: "message",
    message: {
      channelId: String(chat?.id || ""),
      userId: String(from?.id || ""),
      messageId: String(message.message_id || "") + "-" + String(chat?.id || ""),
      text,
      timestamp: Number(message.date || 0) * 1000,
      chatType: chatType === "private" ? "direct" : "group",
      threadId: message.message_thread_id ? String(message.message_thread_id) : undefined,
    },
  };
}

/**
 * 通过长轮询获取 Telegram 更新。
 *
 * @param account 账户配置
 * @param offset  上一次更新的 update_id + 1
 * @param timeout 轮询超时（秒）
 */
export async function getTelegramUpdates(
  account: TelegramAccountConfig,
  offset?: number,
  timeout = 30,
): Promise<unknown[]> {
  const params = new URLSearchParams({
    timeout: String(timeout),
    allowed_updates: JSON.stringify(["message", "channel_post", "edited_message"]),
  });
  if (offset) {
    params.set("offset", String(offset));
  }

  const response = await fetch(`${buildApiUrl(account, "getUpdates")}?${params}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as { ok: boolean; result?: unknown[] };
  return data.result ?? [];
}

/** 设置 Telegram Webhook */
export async function setTelegramWebhook(
  account: TelegramAccountConfig,
  webhookUrl: string,
  secret?: string,
): Promise<boolean> {
  const body: Record<string, unknown> = { url: webhookUrl };
  if (secret) {
    body.secret_token = secret;
  }

  const response = await fetch(buildApiUrl(account, "setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.ok;
}
