import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface WechatAccountConfig {
  webhookUrl: string;
  gatewayUrl?: string;
  token?: string;
  toUser?: string;
  corpid?: string;
  corpsecret?: string;
  agentid?: string;
}

export class WechatChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: WechatAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): WechatAccountConfig {
    const wechatChannels = (this.config.wechatChannels as Record<string, WechatAccountConfig>) || {};
    return wechatChannels[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "微信",
      selectionLabel: "微信/企业微信",
      blurb: "支持企业微信群机器人和个人微信网关",
      aliases: ["wechat", "weixin", "wechat_work", "work_wechat"],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ["direct", "group"],
      media: true,
      reactions: true,
      threads: false,
      polls: false,
      mentions: true,
      voice: true,
      video: false,
      typing: false,
    };
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const { webhookUrl, gatewayUrl, token, toUser } = this.accountConfig;

    if (webhookUrl) {
      return this.sendViaWebhook(message, webhookUrl);
    }

    if (gatewayUrl && token && toUser) {
      return this.sendViaGateway(message, gatewayUrl, token, toUser);
    }

    return { success: false, error: "未配置 webhookUrl 或 gatewayUrl/token/toUser" };
  }

  private async sendViaWebhook(message: ChannelMessage, webhookUrl: string): Promise<ChannelMessageSendResult> {
    try {
      const body = message.contentType === "markdown"
        ? { msgtype: "markdown", markdown: { content: message.content } }
        : { msgtype: "text", text: { content: message.content } };

      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json() as { errcode?: number };
      const success = data.errcode === 0 || resp.ok;

      if (!success) {
        return { success: false, error: `微信 API 返回错误: ${JSON.stringify(data)}` };
      }

      logger.info(`[ChannelProvider:Wechat] 消息已发送`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Wechat] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  private async sendViaGateway(
    message: ChannelMessage,
    gatewayUrl: string,
    token: string,
    toUser: string
  ): Promise<ChannelMessageSendResult> {
    try {
      const resp = await fetch(`${gatewayUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          toUser,
          content: message.content,
          contentType: message.contentType ?? "text",
        }),
      });

      const data = await resp.json() as { success: boolean; error?: string };
      if (!data.success) {
        return { success: false, error: data.error || "网关返回失败" };
      }

      logger.info(`[ChannelProvider:Wechat] 消息已发送至 ${toUser}`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Wechat] 网关发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    const { webhookUrl, gatewayUrl, token } = this.accountConfig;
    return !!(webhookUrl || (gatewayUrl && token));
  }
}