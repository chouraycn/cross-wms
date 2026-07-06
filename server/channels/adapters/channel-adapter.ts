import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from '../types.js';
import type { ChannelMessage, ChannelMessageSendResult } from '../message/types.js';

export type ChannelEventName =
  | 'message_received'
  | 'message_sent'
  | 'message_updated'
  | 'message_deleted'
  | 'channel_connected'
  | 'channel_disconnected'
  | 'channel_error';

export interface ChannelEvent {
  name: ChannelEventName;
  channelId: ChannelId;
  accountId: AccountId;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface ChannelEventEmitter {
  on(event: ChannelEventName, handler: (event: ChannelEvent) => void): void;
  off(event: ChannelEventName, handler: (event: ChannelEvent) => void): void;
  emit(event: ChannelEvent): void;
}

export interface ChannelAdapterOptions {
  channelId: ChannelId;
  accountId: AccountId;
  config: AppConfig;
  eventEmitter?: ChannelEventEmitter;
}

export abstract class ChannelAdapter {
  protected channelId: ChannelId;
  protected accountId: AccountId;
  protected config: AppConfig;
  protected eventEmitter?: ChannelEventEmitter;

  constructor(options: ChannelAdapterOptions) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.eventEmitter = options.eventEmitter;
  }

  abstract getMeta(): ChannelMeta;
  abstract getCapabilities(): ChannelCapabilities;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;

  abstract sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult>;
  abstract receiveMessages(): AsyncIterable<ChannelMessage | null>;

  protected emitEvent(name: ChannelEventName, data?: Record<string, unknown>): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit({
        name,
        channelId: this.channelId,
        accountId: this.accountId,
        timestamp: Date.now(),
        data,
      });
    }
  }
}

export interface ChannelAdapterFactory {
  create(options: ChannelAdapterOptions): ChannelAdapter;
  getChannelId(): ChannelId;
  getChannelMeta(): ChannelMeta;
  getCapabilities(): ChannelCapabilities;
}

export class ChannelEventBus implements ChannelEventEmitter {
  private listeners: Map<ChannelEventName, Set<(event: ChannelEvent) => void>> = new Map();

  on(event: ChannelEventName, handler: (event: ChannelEvent) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off(event: ChannelEventName, handler: (event: ChannelEvent) => void): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  emit(event: ChannelEvent): void {
    const set = this.listeners.get(event.name);
    if (set) {
      for (const handler of set) {
        try {
          handler(event);
        } catch {
        }
      }
    }
  }

  clear(event?: ChannelEventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}