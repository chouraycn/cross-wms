import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface FeishuAccountConfig {
  botWebhookUrl: string;
  appId?: string;
  appSecret?: string;
}

export class FeishuChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: FeishuAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): FeishuAccountConfig {
    const feishuChannels = (this.config.feishuChannels as Record<string, FeishuAccountConfig>) || {};
    return feishuChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "飞书",
      selectionLabel: "飞书群机器人",
      blurb: "通过飞书群机器人发送消息",
      aliases: ["feishu", "lark"],
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
      typing: true,
    };
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const { botWebhookUrl } = this.accountConfig;
    if (!botWebhookUrl) {
      return { success: false, error: "未配置 botWebhookUrl" };
    }

    try {
      const body = message.contentType === "markdown"
        ? { msg_type: "markdown", content: { text: message.content } }
        : { msg_type: "text", content: { text: message.content } };

      const resp = await fetch(botWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json() as { code?: number };
      const success = data.code === 0 || resp.ok;

      if (!success) {
        return { success: false, error: `飞书 API 返回错误: ${JSON.stringify(data)}` };
      }

      logger.info(`[ChannelProvider:Feishu] 消息已发送`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Feishu] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!this.accountConfig.botWebhookUrl;
  }
}