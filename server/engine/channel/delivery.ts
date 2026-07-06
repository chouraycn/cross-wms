/**
 * Delivery 投递系统
 *
 * 基于 OpenClaw 通道系统的 Delivery 架构，
 * 管理消息的投递策略、重试和持久化。
 */

import EventEmitter from 'eventemitter3';
import { messageLifecycleManager } from './message-lifecycle.js';

export type DeliveryStatus =
  | 'pending'
  | 'in_progress'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type DeliveryStrategy =
  | 'at_least_once'
  | 'at_most_once'
  | 'exactly_once'
  | 'best_effort';

export type RetryStrategy = 'exponential' | 'linear' | 'fixed' | 'none';

export interface DeliveryOptions {
  strategy?: DeliveryStrategy;
  retryStrategy?: RetryStrategy;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
  priority?: number;
  deadlineMs?: number;
  deduplicate?: boolean;
  idempotencyKey?: string;
}

export interface DeliveryItem {
  id: string;
  messageId: string;
  channelType: string;
  channelName: string;
  recipient: string;
  content: string;
  contentType: string;
  metadata: Record<string, unknown>;
  status: DeliveryStatus;
  options: Required<DeliveryOptions>;
  attempts: number;
  lastAttemptAt?: number;
  nextAttemptAt?: number;
  createdAt: number;
  deliveredAt?: number;
  failedAt?: number;
  error?: string;
  idempotencyKey?: string;
}

export interface DeliveryBatch {
  id: string;
  items: DeliveryItem[];
  status: DeliveryStatus;
  createdAt: number;
  completedAt?: number;
  totalItems: number;
  deliveredCount: number;
  failedCount: number;
}

export interface DeliveryManagerEvents {
  delivery_queued: [item: DeliveryItem];
  delivery_started: [item: DeliveryItem];
  delivery_delivered: [item: DeliveryItem];
  delivery_failed: [item: DeliveryItem, error: string];
  delivery_retrying: [item: DeliveryItem, attempt: number];
  delivery_cancelled: [itemId: string];
  batch_completed: [batch: DeliveryBatch];
  queue_empty: [];
}

export class DeliveryManager extends EventEmitter<DeliveryManagerEvents> {
  private queue: DeliveryItem[] = [];
  private inProgress: Map<string, DeliveryItem> = new Map();
  private completed: Map<string, DeliveryItem> = new Map();
  private idempotencyKeys: Set<string> = new Set();
  private isProcessing = false;
  private concurrencyLimit = 5;
  private maxQueueSize = 10000;

  queueDelivery(params: {
    messageId?: string;
    channelType: string;
    channelName: string;
    recipient: string;
    content: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
    options?: DeliveryOptions;
  }): DeliveryItem {
    const now = Date.now();
    const options: Required<DeliveryOptions> = {
      strategy: 'at_least_once',
      retryStrategy: 'exponential',
      maxRetries: 3,
      initialBackoffMs: 1000,
      maxBackoffMs: 30000,
      timeoutMs: 30000,
      priority: 0,
      deadlineMs: 3600000,
      deduplicate: true,
      idempotencyKey: undefined,
      ...params.options,
    };

    if (options.deduplicate && options.idempotencyKey) {
      if (this.idempotencyKeys.has(options.idempotencyKey)) {
        const existing = this.completed.get(options.idempotencyKey);
        if (existing) return existing;
      }
    }

    const item: DeliveryItem = {
      id: `delivery_${now}_${Math.random().toString(36).slice(2, 9)}`,
      messageId: params.messageId || `msg_${now}`,
      channelType: params.channelType,
      channelName: params.channelName,
      recipient: params.recipient,
      content: params.content,
      contentType: params.contentType || 'text',
      metadata: params.metadata || {},
      status: 'pending',
      options,
      attempts: 0,
      createdAt: now,
      nextAttemptAt: now,
      idempotencyKey: options.idempotencyKey,
    };

    if (this.queue.length >= this.maxQueueSize) {
      item.status = 'failed';
      item.error = 'Queue full';
      item.failedAt = now;
      this.completed.set(item.id, item);
      return item;
    }

    this.insertIntoQueue(item);
    this.emit('delivery_queued', item);

    if (!this.isProcessing) {
      this.processQueue();
    }

    return item;
  }

  private insertIntoQueue(item: DeliveryItem): void {
    const index = this.queue.findIndex(
      (i) => (i.options.priority || 0) < (item.options.priority || 0),
    );
    if (index === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(index, 0, item);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.inProgress.size < this.concurrencyLimit) {
        const now = Date.now();
        const nextIndex = this.queue.findIndex((item) => {
          if (item.nextAttemptAt && item.nextAttemptAt > now) return false;
          if (item.options.deadlineMs && now - item.createdAt > item.options.deadlineMs) {
            item.status = 'expired';
            item.failedAt = now;
            item.error = 'Deadline exceeded';
            this.completed.set(item.id, item);
            return false;
          }
          return true;
        });

        if (nextIndex === -1) break;

        const item = this.queue.splice(nextIndex, 1)[0];
        this.deliverItem(item);
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length === 0) {
        this.emit('queue_empty');
      }
    }
  }

  private async deliverItem(item: DeliveryItem): Promise<void> {
    item.status = 'in_progress';
    item.attempts++;
    item.lastAttemptAt = Date.now();
    this.inProgress.set(item.id, item);
    this.emit('delivery_started', item);

    try {
      const success = await this.attemptDelivery(item);

      if (success) {
        item.status = 'delivered';
        item.deliveredAt = Date.now();
        this.completed.set(item.id, item);
        this.inProgress.delete(item.id);

        if (item.idempotencyKey) {
          this.idempotencyKeys.add(item.idempotencyKey);
        }

        messageLifecycleManager.transitionState(item.messageId, 'delivered');
        this.emit('delivery_delivered', item);
      } else {
        throw new Error('Delivery failed');
      }
    } catch (error) {
      item.error = (error as Error).message;

      if (this.shouldRetry(item)) {
        item.status = 'pending';
        item.nextAttemptAt = this.calculateNextRetry(item);
        this.insertIntoQueue(item);
        this.inProgress.delete(item.id);
        this.emit('delivery_retrying', item, item.attempts);
      } else {
        item.status = 'failed';
        item.failedAt = Date.now();
        this.completed.set(item.id, item);
        this.inProgress.delete(item.id);

        messageLifecycleManager.transitionState(item.messageId, 'failed', {
          error: item.error,
        });
        this.emit('delivery_failed', item, item.error);
      }
    }

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async attemptDelivery(item: DeliveryItem): Promise<boolean> {
    return true;
  }

  private shouldRetry(item: DeliveryItem): boolean {
    if (item.options.retryStrategy === 'none') return false;
    if (item.attempts >= item.options.maxRetries) return false;
    if (item.status === 'expired') return false;
    return true;
  }

  private calculateNextRetry(item: DeliveryItem): number {
    const now = Date.now();
    const { retryStrategy, initialBackoffMs, maxBackoffMs } = item.options;

    switch (retryStrategy) {
      case 'exponential':
        const exponentialDelay = Math.min(
          initialBackoffMs * Math.pow(2, item.attempts - 1),
          maxBackoffMs,
        );
        const jitter = exponentialDelay * 0.1 * (Math.random() - 0.5);
        return now + exponentialDelay + jitter;

      case 'linear':
        return now + initialBackoffMs * item.attempts;

      case 'fixed':
        return now + initialBackoffMs;

      default:
        return now + initialBackoffMs;
    }
  }

  cancelDelivery(itemId: string): boolean {
    const queueIndex = this.queue.findIndex((i) => i.id === itemId);
    if (queueIndex > -1) {
      const item = this.queue.splice(queueIndex, 1)[0];
      item.status = 'cancelled';
      this.completed.set(itemId, item);
      this.emit('delivery_cancelled', itemId);
      return true;
    }

    const inProgress = this.inProgress.get(itemId);
    if (inProgress) {
      inProgress.status = 'cancelled';
      this.completed.set(itemId, inProgress);
      this.inProgress.delete(itemId);
      this.emit('delivery_cancelled', itemId);
      return true;
    }

    return false;
  }

  getDelivery(itemId: string): DeliveryItem | undefined {
    return (
      this.queue.find((i) => i.id === itemId) ||
      this.inProgress.get(itemId) ||
      this.completed.get(itemId)
    );
  }

  getQueueStatus(): {
    pending: number;
    inProgress: number;
    completed: number;
    delivered: number;
    failed: number;
  } {
    const completedItems = Array.from(this.completed.values());
    return {
      pending: this.queue.length,
      inProgress: this.inProgress.size,
      completed: completedItems.length,
      delivered: completedItems.filter((i) => i.status === 'delivered').length,
      failed: completedItems.filter((i) => i.status === 'failed').length,
    };
  }

  setConcurrencyLimit(limit: number): void {
    this.concurrencyLimit = Math.max(1, limit);
  }

  clearCompleted(): void {
    this.completed.clear();
    this.idempotencyKeys.clear();
  }

  clearAll(): void {
    this.queue = [];
    this.inProgress.clear();
    this.completed.clear();
    this.idempotencyKeys.clear();
    this.isProcessing = false;
  }
}

export const deliveryManager = new DeliveryManager();
