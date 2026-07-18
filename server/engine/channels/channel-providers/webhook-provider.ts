import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface WebhookAccountConfig {
  webhookUrl: string;
  secret?: string;
}

export class WebhookChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: WebhookAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): WebhookAccountConfig {
    const webhookChannels = (this.config.webhookChannels as Record<string, WebhookAccountConfig>) || {};
    return webhookChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "Webhook",
      selectionLabel: "Webhook 通知渠道",
      blurb: "通过 HTTP Webhook 发送消息",
      aliases: ["webhook", "http"],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ["direct"],
      media: false,
      reactions: false,
      threads: false,
      polls: false,
      mentions: false,
      voice: false,
      video: false,
      typing: false,
    };
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const { webhookUrl } = this.accountConfig;
    if (!webhookUrl) {
      return { success: false, error: "未配置 webhookUrl" };
    }

    try {
      const body = message.contentType === "markdown"
        ? { msg_type: "markdown", content: { text: message.content } }
        : { text: message.content };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.accountConfig.secret) {
        headers["X-Webhook-Secret"] = this.accountConfig.secret;
      }

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` };
      }

      logger.info(`[ChannelProvider:Webhook] 消息已发送到 ${webhookUrl}`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Webhook] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!this.accountConfig.webhookUrl;
  }
}