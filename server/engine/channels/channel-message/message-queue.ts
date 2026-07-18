import { logger } from "../../../logger.js";
import type { ChannelMessage } from "../../../channels/message/types.js";

export type QueuePriority = "low" | "normal" | "high" | "critical";

export interface QueuedMessage {
  message: ChannelMessage;
  priority: QueuePriority;
  enqueueTime: number;
  attempts: number;
  maxAttempts: number;
}

export interface QueueOptions {
  maxSize?: number;
  defaultPriority?: QueuePriority;
  maxAttempts?: number;
}

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private maxSize: number;
  private defaultPriority: QueuePriority;
  private maxAttempts: number;
  private processing = false;

  constructor(options: QueueOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultPriority = options.defaultPriority ?? "normal";
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  enqueue(message: ChannelMessage, priority?: QueuePriority): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
      logger.warn(`[ChannelMessage:Queue] Queue full, dropped oldest message`);
    }

    const queued: QueuedMessage = {
      message,
      priority: priority ?? this.defaultPriority,
      enqueueTime: Date.now(),
      attempts: 0,
      maxAttempts: this.maxAttempts,
    };

    this.queue.push(queued);
    this.sortQueue();

    logger.debug(`[ChannelMessage:Queue] Enqueued message ${message.id} with priority ${queued.priority}`);
  }

  dequeue(): QueuedMessage | undefined {
    return this.queue.shift();
  }

  peek(): QueuedMessage | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue = [];
    logger.debug(`[ChannelMessage:Queue] Queue cleared`);
  }

  remove(messageId: string): boolean {
    const idx = this.queue.findIndex((q) => q.message.id === messageId);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    logger.debug(`[ChannelMessage:Queue] Removed message ${messageId}`);
    return true;
  }

  getMessagesByPriority(priority: QueuePriority): QueuedMessage[] {
    return this.queue.filter((q) => q.priority === priority);
  }

  incrementAttempt(messageId: string): boolean {
    const queued = this.queue.find((q) => q.message.id === messageId);
    if (!queued) return false;
    queued.attempts++;
    return true;
  }

  async process(handler: (message: ChannelMessage) => Promise<void>): Promise<void> {
    if (this.processing) {
      logger.debug(`[ChannelMessage:Queue] Already processing`);
      return;
    }

    this.processing = true;

    try {
      while (!this.isEmpty()) {
        const queued = this.dequeue();
        if (!queued) continue;

        try {
          await handler(queued.message);
          logger.debug(`[ChannelMessage:Queue] Processed message ${queued.message.id}`);
        } catch (error) {
          queued.attempts++;
          logger.error(`[ChannelMessage:Queue] Failed to process ${queued.message.id} (attempt ${queued.attempts})`, { error });

          if (queued.attempts < queued.maxAttempts) {
            this.enqueue(queued.message, queued.priority);
          } else {
            logger.warn(`[ChannelMessage:Queue] Max attempts reached for ${queued.message.id}`);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
  }

  getStats() {
    const stats: Record<QueuePriority, number> = { low: 0, normal: 0, high: 0, critical: 0 };
    for (const queued of this.queue) {
      stats[queued.priority]++;
    }
    return {
      total: this.queue.length,
      byPriority: stats,
      processing: this.processing,
    };
  }
}