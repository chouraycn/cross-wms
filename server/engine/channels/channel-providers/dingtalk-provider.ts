import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface DingtalkAccountConfig {
  webhookUrl: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class DingtalkChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: DingtalkAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): DingtalkAccountConfig {
    const dingtalkChannels = (this.config.dingtalkChannels as Record<string, DingtalkAccountConfig>) || {};
    return dingtalkChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "钉钉",
      selectionLabel: "钉钉群机器人",
      blurb: "通过钉钉群机器人发送消息，支持 Stream API 入站",
      aliases: ["dingtalk", "ding"],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ["direct", "group"],
      media: true,
      reactions: true,
      threads: true,
      polls: false,
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
      const body = message.contentType === "markdown"
        ? { msgtype: "markdown", markdown: { title: "通知", text: message.content } }
        : { msgtype: "text", text: { content: message.content } };

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json() as { errcode?: number };
      const success = data.errcode === 0 || resp.ok;

      if (!success) {
        return { success: false, error: `钉钉 API 返回错误: ${JSON.stringify(data)}` };
      }

      logger.info(`[ChannelProvider:Dingtalk] 消息已发送`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Dingtalk] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!(this.accountConfig.webhookUrl || this.accountConfig.accessToken);
  }
}