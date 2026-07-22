import { logger } from '../../logger.js';
import type { ChannelId, AccountId } from '../types.js';
import type { DeliveryStrategy } from '../outbound/deliver.js';

export type MessageStatus = 'pending' | 'sending' | 'sent' | 'suppressed' | 'failed';

export interface DurableMessage {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  to: string;
  content: string;
  strategy: DeliveryStrategy;
  status: MessageStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptedAt?: number;
  error?: string;
  receipt?: MessageReceipt;
  metadata?: Record<string, unknown>;
}

export interface MessageReceipt {
  messageId: string;
  deliveredAt?: number;
  channelData?: Record<string, unknown>;
}

export interface DurableMessageStore {
  save(message: DurableMessage): Promise<void>;
  get(id: string): Promise<DurableMessage | undefined>;
  update(message: DurableMessage): Promise<void>;
  delete(id: string): Promise<void>;
  listByStatus(status: MessageStatus): Promise<DurableMessage[]>;
  listByChannel(channelId: ChannelId): Promise<DurableMessage[]>;
  listPending(): Promise<DurableMessage[]>;
  cleanupOldMessages(maxAgeMs: number): Promise<number>;
}

export interface DurableMessageManagerOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  maxMessageAgeMs?: number;
  cleanupIntervalMs?: number;
}

export class DurableMessageManager {
  private store: DurableMessageStore;
  private maxAttempts: number;
  private retryDelayMs: number;
  private maxMessageAgeMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(store: DurableMessageStore, options?: DurableMessageManagerOptions) {
    this.store = store;
    this.maxAttempts = options?.maxAttempts ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 5000;
    this.maxMessageAgeMs = options?.maxMessageAgeMs ?? 86400000;

    if (options?.cleanupIntervalMs) {
      this.startCleanupInterval(options.cleanupIntervalMs);
    }
  }

  private startCleanupInterval(intervalMs: number): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        const deleted = await this.store.cleanupOldMessages(this.maxMessageAgeMs);
        if (deleted > 0) {
          logger.debug(`[DurableMessageManager] Cleaned up ${deleted} old messages`);
        }
      } catch (err) {
        logger.error(`[DurableMessageManager] Cleanup failed:`, err);
      }
    }, intervalMs);
  }

  async createMessage(params: {
    channelId: ChannelId;
    accountId?: AccountId;
    to: string;
    content: string;
    strategy: DeliveryStrategy;
    metadata?: Record<string, unknown>;
  }): Promise<DurableMessage> {
    const message: DurableMessage = {
      id: this.generateId(),
      channelId: params.channelId,
      accountId: params.accountId,
      to: params.to,
      content: params.content,
      strategy: params.strategy,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    await this.store.save(message);
    logger.debug(`[DurableMessageManager] Created durable message: ${message.id}`);
    return message;
  }

  async updateStatus(id: string, status: MessageStatus, receipt?: MessageReceipt, error?: string): Promise<void> {
    const message = await this.store.get(id);
    if (!message) {
      logger.warn(`[DurableMessageManager] Message not found: ${id}`);
      return;
    }

    message.status = status;
    message.lastAttemptedAt = Date.now();
    if (receipt) {
      message.receipt = receipt;
    }
    if (error) {
      message.error = error;
      message.attempts++;
    }

    await this.store.update(message);
    logger.debug(`[DurableMessageManager] Updated message ${id} status: ${status}`);
  }

  async markAsSent(id: string, receipt: MessageReceipt): Promise<void> {
    await this.updateStatus(id, 'sent', receipt);
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    await this.updateStatus(id, 'failed', undefined, error);
  }

  async markAsSuppressed(id: string): Promise<void> {
    await this.updateStatus(id, 'suppressed');
  }

  async getMessage(id: string): Promise<DurableMessage | undefined> {
    return this.store.get(id);
  }

  async listPendingMessages(): Promise<DurableMessage[]> {
    return this.store.listPending();
  }

  async scheduleRetry(id: string): Promise<void> {
    const message = await this.store.get(id);
    if (!message) {
      logger.warn(`[DurableMessageManager] Message not found for retry: ${id}`);
      return;
    }

    if (message.attempts >= message.maxAttempts) {
      logger.warn(`[DurableMessageManager] Max attempts reached for message: ${id}`);
      await this.markAsFailed(id, 'Max delivery attempts exceeded');
      return;
    }

    message.status = 'pending';
    await this.store.update(message);
    logger.debug(`[DurableMessageManager] Scheduled retry for message: ${id}`);
  }

  async getRetryDelay(message: DurableMessage): Promise<number> {
    const baseDelay = this.retryDelayMs;
    const backoffFactor = Math.pow(2, message.attempts);
    const jitter = Math.random() * baseDelay * 0.5;
    return baseDelay * backoffFactor + jitter;
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.store.cleanupOldMessages(this.maxMessageAgeMs);
  }

  private generateId(): string {
    return `dm_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

class InMemoryDurableMessageStore implements DurableMessageStore {
  private messages = new Map<string, DurableMessage>();

  async save(message: DurableMessage): Promise<void> {
    this.messages.set(message.id, message);
  }

  async get(id: string): Promise<DurableMessage | undefined> {
    return this.messages.get(id);
  }

  async update(message: DurableMessage): Promise<void> {
    this.messages.set(message.id, message);
  }

  async delete(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async listByStatus(status: MessageStatus): Promise<DurableMessage[]> {
    return Array.from(this.messages.values()).filter((m) => m.status === status);
  }

  async listByChannel(channelId: ChannelId): Promise<DurableMessage[]> {
    return Array.from(this.messages.values()).filter((m) => m.channelId === channelId);
  }

  async listPending(): Promise<DurableMessage[]> {
    return Array.from(this.messages.values()).filter((m) => m.status === 'pending');
  }

  async cleanupOldMessages(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let deleted = 0;
    for (const [id, message] of this.messages.entries()) {
      if (now - message.createdAt > maxAgeMs) {
        this.messages.delete(id);
        deleted++;
      }
    }
    return deleted;
  }
}

export const durableMessageStore: DurableMessageStore = new InMemoryDurableMessageStore();
export const durableMessageManager = new DurableMessageManager(durableMessageStore);