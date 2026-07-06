import type { ChannelId, ChannelMeta, ChannelCapabilities, AppConfig } from '../types.js';
import { ChannelAdapter, ChannelAdapterFactory } from './channel-adapter.js';
import { WebhookChannelAdapterFactory } from './webhook-adapter.js';
import { EmailChannelAdapterFactory } from './email-adapter.js';

export class ChannelAdapterRegistry {
  private factories: Map<ChannelId, ChannelAdapterFactory> = new Map();
  private instances: Map<string, ChannelAdapter> = new Map();

  constructor() {
    this.registerFactory(new WebhookChannelAdapterFactory());
    this.registerFactory(new EmailChannelAdapterFactory());
  }

  registerFactory(factory: ChannelAdapterFactory): void {
    this.factories.set(factory.getChannelId(), factory);
  }

  unregisterFactory(channelId: ChannelId): void {
    this.factories.delete(channelId);
  }

  getFactory(channelId: ChannelId): ChannelAdapterFactory | undefined {
    return this.factories.get(channelId);
  }

  listFactories(): ChannelAdapterFactory[] {
    return Array.from(this.factories.values());
  }

  createAdapter(channelId: ChannelId, accountId: string, config: AppConfig): ChannelAdapter | undefined {
    const factory = this.factories.get(channelId);
    if (!factory) {
      return undefined;
    }

    const key = `${channelId}:${accountId}`;
    const existing = this.instances.get(key);
    if (existing && existing.isConnected()) {
      return existing;
    }

    const adapter = factory.create({ channelId, accountId, config });
    this.instances.set(key, adapter);
    return adapter;
  }

  getAdapter(channelId: ChannelId, accountId: string): ChannelAdapter | undefined {
    const key = `${channelId}:${accountId}`;
    return this.instances.get(key);
  }

  async connectAdapter(channelId: ChannelId, accountId: string, config: AppConfig): Promise<ChannelAdapter | undefined> {
    const adapter = this.createAdapter(channelId, accountId, config);
    if (adapter) {
      await adapter.connect();
    }
    return adapter;
  }

  async disconnectAdapter(channelId: ChannelId, accountId: string): Promise<void> {
    const adapter = this.getAdapter(channelId, accountId);
    if (adapter) {
      await adapter.disconnect();
      const key = `${channelId}:${accountId}`;
      this.instances.delete(key);
    }
  }

  disconnectAll(): void {
    this.instances.forEach(adapter => {
      if (adapter.isConnected()) {
        adapter.disconnect();
      }
    });
    this.instances.clear();
  }

  listAdapters(): ChannelAdapter[] {
    return Array.from(this.instances.values());
  }

  getChannelMeta(channelId: ChannelId): ChannelMeta | undefined {
    return this.factories.get(channelId)?.getChannelMeta();
  }

  getChannelCapabilities(channelId: ChannelId): ChannelCapabilities | undefined {
    return this.factories.get(channelId)?.getCapabilities();
  }
}

export const channelAdapterRegistry = new ChannelAdapterRegistry();