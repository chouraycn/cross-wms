import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from '../types.js';
import type { ChannelMessage, ChannelMessageSendResult } from '../message/types.js';
import { ChannelAdapter, ChannelAdapterFactory } from './channel-adapter.js';

export class EmailChannelAdapter extends ChannelAdapter {
  private connected: boolean = false;
  private smtpConfig: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  };

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    super({ channelId: options.channelId, accountId: options.accountId, config: options.config });
    
    const emailAccounts = options.config.emailAccounts as Record<string, {
      host?: unknown;
      port?: unknown;
      secure?: unknown;
      auth?: { user?: unknown; pass?: unknown };
    }> || {};
    const emailConfig = emailAccounts[options.accountId] || {};
    this.smtpConfig = {
      host: String(emailConfig.host || 'localhost'),
      port: Number(emailConfig.port || 587),
      secure: Boolean(emailConfig.secure || false),
      auth: emailConfig.auth ? {
        user: String(emailConfig.auth.user),
        pass: String(emailConfig.auth.pass),
      } : undefined,
    };
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: 'Email',
      selectionLabel: 'Email Integration',
      blurb: 'Send and receive messages via email',
      aliases: ['email', 'mail', 'smtp'],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ['direct'],
      media: true,
      reactions: false,
      threads: true,
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
    const to = message.metadata?.to as string;
    if (!to) {
      return { success: false, error: 'Recipient email not specified' };
    }

    this.emitEvent('message_sent', { messageId: message.id, to });
    return { success: true, messageId: message.id };
  }

  async *receiveMessages(): AsyncIterable<ChannelMessage | null> {
    while (this.isConnected()) {
      await new Promise(resolve => setTimeout(resolve, 60000));
      yield null;
    }
  }
}

export class EmailChannelAdapterFactory implements ChannelAdapterFactory {
  create(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }): EmailChannelAdapter {
    return new EmailChannelAdapter(options);
  }

  getChannelId(): ChannelId {
    return 'email';
  }

  getChannelMeta(): ChannelMeta {
    return {
      id: 'email',
      label: 'Email',
      selectionLabel: 'Email Integration',
      blurb: 'Send and receive messages via email',
      aliases: ['email', 'mail', 'smtp'],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ['direct'],
      media: true,
      reactions: false,
      threads: true,
      polls: false,
      mentions: false,
      voice: false,
      video: false,
      typing: false,
    };
  }
}