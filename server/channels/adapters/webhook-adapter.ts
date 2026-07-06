import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from '../types.js';
import type { ChannelMessage, ChannelMessageSendResult } from '../message/types.js';
import { ChannelAdapter, ChannelAdapterFactory } from './channel-adapter.js';

export class WebhookChannelAdapter extends ChannelAdapter {
  private connected: boolean = false;
  private webhookUrl: string;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig; webhookUrl: string }) {
    super({ channelId: options.channelId, accountId: options.accountId, config: options.config });
    this.webhookUrl = options.webhookUrl;
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: 'Webhook',
      selectionLabel: 'Webhook Integration',
      blurb: 'Send and receive messages via HTTP webhooks',
      aliases: ['webhook', 'http'],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ['direct'],
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

  async connect(): Promise<void> {
    this.connected = true;
    this.emitEvent('channel_connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitEvent('channel_disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      this.emitEvent('message_sent', { messageId: message.id });
      return { success: true, messageId: message.id };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async *receiveMessages(): AsyncIterable<ChannelMessage | null> {
    while (this.isConnected()) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      yield null;
    }
  }

  async handleIncomingWebhook(payload: unknown): Promise<ChannelMessage | null> {
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }

    const msg = payload as Partial<ChannelMessage>;
    if (!msg.id || !msg.content) {
      return null;
    }

    const message: ChannelMessage = {
      id: String(msg.id),
      channelId: this.channelId,
      accountId: this.accountId,
      conversationId: msg.conversationId || 'default',
      senderId: msg.senderId || 'webhook',
      senderName: msg.senderName || 'Webhook',
      content: String(msg.content),
      contentType: msg.contentType || 'text',
      timestamp: msg.timestamp || Date.now(),
      metadata: msg.metadata,
    };

    this.emitEvent('message_received', { messageId: message.id });
    return message;
  }
}

export class WebhookChannelAdapterFactory implements ChannelAdapterFactory {
  create(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }): WebhookChannelAdapter {
    const webhookUrls = options.config.webhookUrls as Record<string, string> || {};
    const webhookUrl = webhookUrls[options.accountId] || '';
    return new WebhookChannelAdapter({ ...options, webhookUrl });
  }

  getChannelId(): ChannelId {
    return 'webhook';
  }

  getChannelMeta(): ChannelMeta {
    return {
      id: 'webhook',
      label: 'Webhook',
      selectionLabel: 'Webhook Integration',
      blurb: 'Send and receive messages via HTTP webhooks',
      aliases: ['webhook', 'http'],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ['direct'],
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
}