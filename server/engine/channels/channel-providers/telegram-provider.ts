import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface TelegramAccountConfig {
  botToken: string;
  chatId?: string;
}

export class TelegramChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: TelegramAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): TelegramAccountConfig {
    const telegramChannels = (this.config.telegramChannels as Record<string, TelegramAccountConfig>) || {};
    return telegramChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "Telegram",
      selectionLabel: "Telegram Bot",
      blurb: "通过 Telegram Bot 发送消息",
      aliases: ["telegram", "tg"],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
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
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const { botToken, chatId } = this.accountConfig;
    if (!botToken) {
      return { success: false, error: "未配置 botToken" };
    }

    const targetChatId = String(message.metadata?.chatId ?? chatId ?? "");
    if (!targetChatId) {
      return { success: false, error: "未配置 chatId" };
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const body = {
        chat_id: targetChatId,
        text: message.content,
        parse_mode: message.contentType === "markdown" ? "MarkdownV2" : undefined,
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json() as { ok?: boolean };
      const success = data.ok ?? false;

      if (!success) {
        return { success: false, error: `Telegram API 返回错误: ${JSON.stringify(data)}` };
      }

      logger.info(`[ChannelProvider:Telegram] 消息已发送至 ${targetChatId}`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Telegram] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!this.accountConfig.botToken;
  }
}