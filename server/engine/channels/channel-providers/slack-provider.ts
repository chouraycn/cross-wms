import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface SlackAccountConfig {
  webhookUrl: string;
  token?: string;
}

export class SlackChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: SlackAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): SlackAccountConfig {
    const slackChannels = (this.config.slackChannels as Record<string, SlackAccountConfig>) || {};
    return slackChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "Slack",
      selectionLabel: "Slack 工作区",
      blurb: "通过 Slack 机器人发送消息",
      aliases: ["slack"],
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
      typing: true,
    };
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const { webhookUrl } = this.accountConfig;
    if (!webhookUrl) {
      return { success: false, error: "未配置 webhookUrl" };
    }

    try {
      const body = {
        text: message.content,
        mrkdwn: message.contentType === "markdown",
      };

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` };
      }

      logger.info(`[ChannelProvider:Slack] 消息已发送`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Slack] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!this.accountConfig.webhookUrl;
  }
}