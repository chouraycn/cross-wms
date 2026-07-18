import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface DiscordAccountConfig {
  webhookUrl: string;
  botToken?: string;
}

export class DiscordChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: DiscordAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): DiscordAccountConfig {
    const discordChannels = (this.config.discordChannels as Record<string, DiscordAccountConfig>) || {};
    return discordChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "Discord",
      selectionLabel: "Discord 服务器",
      blurb: "通过 Discord Webhook 发送消息",
      aliases: ["discord"],
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
      const body = {
        content: message.content,
      };

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` };
      }

      logger.info(`[ChannelProvider:Discord] 消息已发送`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Discord] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!this.accountConfig.webhookUrl;
  }
}