/**
 * Retry Queue — 消息重试队列
 *
 * 实现指数退避重试策略，支持优先级队列、死信队列和并发控制。
 */

export interface RetryItem {
  id: string;
  messageId: string;
  channelId: string;
  accountId: string;
  recipient: string;
  payload: unknown;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError?: string;
  priority: number;
  backoffMultiplier: number;
  metadata: Record<string, unknown>;
}

export interface RetryQueueConfig {
  maxConcurrent: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
  maxRetryAgeMs: number;
  deadLetterThreshold: number;
  pollIntervalMs: number;
}

export type RetryHandler = (item: RetryItem) => Promise<{ success: boolean; error?: Error }>;

export type RetryQueueEventHandler = (event: string, data: unknown) => void;

export class RetryQueue {
  private queue: RetryItem[] = [];
  private deadLetterQueue: RetryItem[] = [];
  private processing: Set<string> = new Set();
  private config: Required<RetryQueueConfig>;
  private handler?: RetryHandler;
  private eventHandlers: Set<RetryQueueEventHandler> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: Partial<RetryQueueConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 60000,
      backoffFactor: config.backoffFactor ?? 2,
      jitter: config.jitter ?? true,
      maxRetryAgeMs: config.maxRetryAgeMs ?? 24 * 60 * 60 * 1000,
      deadLetterThreshold: config.deadLetterThreshold ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 500,
    };
  }

  setHandler(handler: RetryHandler): void {
    this.handler = handler;
  }

  add(item: Omit<RetryItem, 'createdAt' | 'attempt' | 'nextAttemptAt' | 'backoffMultiplier'> & {
    attempt?: number;
    delayMs?: number;
  }): string {
    const retryItem: RetryItem = {
      ...item,
      id: `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      attempt: item.attempt ?? 0,
      nextAttemptAt: Date.now() + (item.delayMs ?? this.config.baseDelayMs),
      backoffMultiplier: 1,
    };

    this.queue.push(retryItem);
    this.sortQueue();
    this.emit('item-added', retryItem);

    return retryItem.id;
  }

  addForRetry(
    messageId: string,
    channelId: string,
    accountId: string,
    recipient: string,
    payload: unknown,
    error: Error,
    priority: number = 0,
  ): string | null {
    const existingIndex = this.queue.findIndex((i) => i.messageId === messageId);
    let item: RetryItem;

    if (existingIndex !== -1) {
      item = this.queue[existingIndex];
      item.attempt++;
      item.lastError = error.message;
    } else {
      item = {
        id: `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        messageId,
        channelId,
        accountId,
        recipient,
        payload,
        attempt: 1,
        maxAttempts: this.config.deadLetterThreshold,
        nextAttemptAt: Date.now() + this.config.baseDelayMs,
        createdAt: Date.now(),
        lastError: error.message,
        priority,
        backoffMultiplier: 1,
        metadata: {},
      };
    }

    if (item.attempt >= item.maxAttempts) {
      this.moveToDeadLetter(item, 'Max retry attempts exceeded');
      return null;
    }

    const delay = this.calculateBackoff(item.attempt);
    item.nextAttemptAt = Date.now() + delay;
    item.backoffMultiplier = delay / this.config.baseDelayMs;

    if (existingIndex === -1) {
      this.queue.push(item);
    }

    this.sortQueue();
    this.emit('item-scheduled', { item, delay });

    return item.id;
  }

  private calculateBackoff(attempt: number): number {
    let delay = this.config.baseDelayMs * Math.pow(this.config.backoffFactor, attempt - 1);

    if (this.config.jitter) {
      const jitter = delay * 0.5 * Math.random();
      delay = delay * 0.75 + jitter;
    }

    return Math.min(delay, this.config.maxDelayMs);
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.nextAttemptAt !== b.nextAttemptAt) {
        return a.nextAttemptAt - b.nextAttemptAt;
      }
      return b.priority - a.priority;
    });
  }

  async processNext(): Promise<RetryItem | null> {
    if (!this.handler) return null;

    const now = Date.now();
    const availableSlots = this.config.maxConcurrent - this.processing.size;

    if (availableSlots <= 0) return null;

    const dueItems = this.queue.filter((item) => item.nextAttemptAt <= now && !this.processing.has(item.id));
    if (dueItems.length === 0) return null;

    const item = dueItems[0];
    this.processing.add(item.id);

    this.emit('item-processing', item);

    try {
      const result = await this.handler(item);

      if (result.success) {
        this.remove(item.id);
        this.emit('item-success', item);
      } else {
        item.lastError = result.error?.message;
        this.handleFailure(item, result.error);
      }

      return result.success ? item : null;
    } catch (error) {
      item.lastError = error instanceof Error ? error.message : String(error);
      this.handleFailure(item, error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      this.processing.delete(item.id);
    }
  }

  private handleFailure(item: RetryItem, error?: Error): void {
    if (item.attempt >= item.maxAttempts) {
      this.moveToDeadLetter(item, error?.message || 'Max retries exceeded');
      return;
    }

    const age = Date.now() - item.createdAt;
    if (age > this.config.maxRetryAgeMs) {
      this.moveToDeadLetter(item, 'Max retry age exceeded');
      return;
    }

    item.attempt++;
    const delay = this.calculateBackoff(item.attempt);
    item.nextAttemptAt = Date.now() + delay;
    item.backoffMultiplier = delay / this.config.baseDelayMs;

    this.sortQueue();
    this.emit('item-retrying', { item, nextAttemptAt: item.nextAttemptAt });
  }

  private moveToDeadLetter(item: RetryItem, reason: string): void {
    const index = this.queue.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }

    (item.metadata as Record<string, unknown>).deadLetterReason = reason;
    this.deadLetterQueue.push(item);
    this.emit('item-dead-letter', { item, reason });
  }

  remove(id: string): boolean {
    const index = this.queue.findIndex((i) => i.id === id);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    this.emit('item-removed', id);
    return true;
  }

  get(id: string): RetryItem | undefined {
    return this.queue.find((i) => i.id === id);
  }

  getByMessageId(messageId: string): RetryItem | undefined {
    return this.queue.find((i) => i.messageId === messageId);
  }

  size(): number {
    return this.queue.length;
  }

  deadLetterSize(): number {
    return this.deadLetterQueue.length;
  }

  getDeadLetterItems(limit?: number): RetryItem[] {
    const items = [...this.deadLetterQueue];
    return limit ? items.slice(0, limit) : items;
  }

  clearDeadLetter(): void {
    this.deadLetterQueue = [];
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.timer = setInterval(() => {
      this.processNext().catch((e) => console.error('Retry queue processing error:', e));
    }, this.config.pollIntervalMs);

    this.emit('queue-started', null);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.emit('queue-stopped', null);
  }

  on(handler: RetryQueueEventHandler): void {
    this.eventHandlers.add(handler);
  }

  off(handler: RetryQueueEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  private emit(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch (e) {
        console.error('Retry queue event handler error:', e);
      }
    }
  }

  getStats(): {
    queued: number;
    processing: number;
    deadLetter: number;
    priorityDistribution: Record<number, number>;
    nextAttemptAt?: number;
  } {
    const priorityDistribution: Record<number, number> = {};
    for (const item of this.queue) {
      priorityDistribution[item.priority] = (priorityDistribution[item.priority] || 0) + 1;
    }

    return {
      queued: this.queue.length,
      processing: this.processing.size,
      deadLetter: this.deadLetterQueue.length,
      priorityDistribution,
      nextAttemptAt: this.queue.length > 0 ? this.queue[0].nextAttemptAt : undefined,
    };
  }

  flush(): RetryItem[] {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }

  clear(): void {
    this.queue = [];
    this.deadLetterQueue = [];
    this.processing.clear();
  }
}

export const retryQueue = new RetryQueue();