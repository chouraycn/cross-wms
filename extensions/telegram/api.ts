/**
 * Telegram Bot API 封装
 *
 * 基于 Telegram Bot HTTP API: https://core.telegram.org/bots/api
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  message_thread_id?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; is_bot: boolean; first_name: string; username?: string };
    message?: TelegramMessage;
    data?: string;
  };
}

export interface TelegramSendMessageResult {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  text?: string;
}

export class TelegramApi {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `${TELEGRAM_API_BASE}/bot${token}`;
  }

  private async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = (await response.json()) as { ok: boolean; result?: T; description?: string };

    if (!data.ok) {
      throw new Error(`Telegram API error (${method}): ${data.description || "Unknown error"}`);
    }

    return data.result as T;
  }

  async getMe(): Promise<TelegramBotInfo> {
    return this.request<TelegramBotInfo>("getMe");
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: "HTML" | "MarkdownV2" | "Markdown";
      replyToMessageId?: number;
      messageThreadId?: number;
      disableWebPagePreview?: boolean;
      disableNotification?: boolean;
    },
  ): Promise<TelegramSendMessageResult> {
    return this.request<TelegramSendMessageResult>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode,
      reply_to_message_id: options?.replyToMessageId,
      message_thread_id: options?.messageThreadId,
      disable_web_page_preview: options?.disableWebPagePreview,
      disable_notification: options?.disableNotification,
    });
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: { parseMode?: "HTML" | "MarkdownV2" | "Markdown" },
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parseMode,
    });
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    return this.request<boolean>("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async getUpdates(
    options?: { offset?: number; limit?: number; timeout?: number; allowedUpdates?: string[] },
  ): Promise<TelegramUpdate[]> {
    return this.request<TelegramUpdate[]>("getUpdates", {
      offset: options?.offset,
      limit: options?.limit,
      timeout: options?.timeout,
      allowed_updates: options?.allowedUpdates
        ? JSON.stringify(options.allowedUpdates)
        : undefined,
    });
  }

  async setWebhook(url: string, options?: { secretToken?: string }): Promise<boolean> {
    return this.request<boolean>("setWebhook", {
      url,
      secret_token: options?.secretToken,
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.request<boolean>("deleteWebhook");
  }

  async getWebhookInfo(): Promise<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }> {
    return this.request("getWebhookInfo");
  }

  async sendChatAction(chatId: number | string, action: string): Promise<boolean> {
    return this.request<boolean>("sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    options?: { text?: string; showAlert?: boolean },
  ): Promise<boolean> {
    return this.request<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: options?.text,
      show_alert: options?.showAlert,
    });
  }

  async sendPhoto(
    chatId: number | string,
    photo: string,
    options?: { caption?: string; replyToMessageId?: number },
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>("sendPhoto", {
      chat_id: chatId,
      photo,
      caption: options?.caption,
      reply_to_message_id: options?.replyToMessageId,
    });
  }

  async setMessageReaction(
    chatId: number | string,
    messageId: number,
    emoji: string,
  ): Promise<boolean> {
    return this.request<boolean>("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: JSON.stringify([{ type: "emoji", emoji }]),
    });
  }
}
