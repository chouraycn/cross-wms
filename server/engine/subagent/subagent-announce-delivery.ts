/**
 * Subagent Announce Delivery — 公告交付逻辑
 *
 * 公告去重、公告队列管理。
 */

import { logger } from '../../logger.js';
import type { SubagentAnnouncement, AnnounceEventType } from './subagent-announce.js';

export interface DeliveryTarget {
  id: string;
  type: 'parent' | 'session' | 'observer';
  deliver: (announcement: SubagentAnnouncement) => void | Promise<void>;
}

interface QueuedAnnouncement {
  announcement: SubagentAnnouncement;
  targets: string[];
  retryCount: number;
  nextRetryAt: number;
}

interface DeliveryStats {
  delivered: number;
  failed: number;
  deduplicated: number;
  queued: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_DEDUPE_WINDOW_MS = 2000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;

export class AnnouncementDelivery {
  private targets = new Map<string, DeliveryTarget>();
  private queue: QueuedAnnouncement[] = [];
  private processing = false;
  private recentAnnouncements = new Map<string, number>();
  private maxRetries: number;
  private retryDelayMs: number;
  private dedupeWindowMs: number;
  private maxQueueSize: number;
  private stats: DeliveryStats = {
    delivered: 0,
    failed: 0,
    deduplicated: 0,
    queued: 0,
  };
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options?: {
    maxRetries?: number;
    retryDelayMs?: number;
    dedupeWindowMs?: number;
    maxQueueSize?: number;
  }) {
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.dedupeWindowMs = options?.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    this.maxQueueSize = options?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  }

  registerTarget(target: DeliveryTarget): () => void {
    this.targets.set(target.id, target);
    return () => {
      this.targets.delete(target.id);
    };
  }

  unregisterTarget(targetId: string): boolean {
    return this.targets.delete(targetId);
  }

  hasTarget(targetId: string): boolean {
    return this.targets.has(targetId);
  }

  getTargetCount(): number {
    return this.targets.size;
  }

  enqueue(announcement: SubagentAnnouncement, targetIds?: string[]): boolean {
    const dedupeKey = this.getDedupeKey(announcement);
    const now = Date.now();
    const lastSeen = this.recentAnnouncements.get(dedupeKey);

    if (lastSeen && now - lastSeen < this.dedupeWindowMs) {
      this.stats.deduplicated++;
      return false;
    }

    this.recentAnnouncements.set(dedupeKey, now);
    this.cleanupRecentAnnouncements();

    const actualTargets = targetIds ?? this.getDefaultTargetIds();

    if (actualTargets.length === 0) {
      return false;
    }

    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('[AnnouncementDelivery] Queue is full, dropping announcement');
      return false;
    }

    this.queue.push({
      announcement,
      targets: actualTargets,
      retryCount: 0,
      nextRetryAt: 0,
    });

    this.stats.queued++;
    this.scheduleProcessing();

    return true;
  }

  private getDedupeKey(announcement: SubagentAnnouncement): string {
    return `${announcement.instanceId}:${announcement.eventType}:${announcement.message || ''}:${Math.floor(announcement.timestamp / this.dedupeWindowMs)}`;
  }

  private getDefaultTargetIds(): string[] {
    return Array.from(this.targets.keys());
  }

  private cleanupRecentAnnouncements(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, timestamp] of this.recentAnnouncements) {
      if (now - timestamp > this.dedupeWindowMs * 2) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.recentAnnouncements.delete(key);
    }
  }

  private scheduleProcessing(): void {
    if (this.processing || this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.processQueue();
    }, 0);
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const now = Date.now();
        const item = this.queue[0];

        if (item.nextRetryAt > now) {
          break;
        }

        this.queue.shift();
        await this.deliverItem(item);
      }
    } finally {
      this.processing = false;
    }

    if (this.queue.length > 0) {
      const nextItem = this.queue[0];
      const delay = Math.max(0, nextItem.nextRetryAt - Date.now());
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.processQueue();
      }, delay);
    }
  }

  private async deliverItem(item: QueuedAnnouncement): Promise<void> {
    const { announcement, targets } = item;
    const failedTargets: string[] = [];

    for (const targetId of targets) {
      const target = this.targets.get(targetId);
      if (!target) continue;

      try {
        const result = target.deliver(announcement);
        if (result instanceof Promise) {
          await result;
        }
        this.stats.delivered++;
      } catch (error) {
        logger.error(
          `[AnnouncementDelivery] Failed to deliver to target ${targetId}:`,
          error instanceof Error ? error.message : String(error),
        );
        failedTargets.push(targetId);
      }
    }

    if (failedTargets.length > 0 && item.retryCount < this.maxRetries) {
      item.retryCount++;
      item.targets = failedTargets;
      item.nextRetryAt = Date.now() + this.retryDelayMs * item.retryCount;
      this.queue.push(item);
    } else if (failedTargets.length > 0) {
      this.stats.failed += failedTargets.length;
      logger.warn(
        `[AnnouncementDelivery] Giving up on announcement ${announcement.id} after ${this.maxRetries} retries`,
      );
    }
  }

  flush(): Promise<void> {
    return this.processQueue();
  }

  getStats(): Readonly<DeliveryStats> {
    return { ...this.stats, queued: this.queue.length };
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.recentAnnouncements.clear();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.processing = false;
  }

  dispose(): void {
    this.clear();
    this.targets.clear();
  }
}

export function createAnnouncementDelivery(
  options?: ConstructorParameters<typeof AnnouncementDelivery>[0],
): AnnouncementDelivery {
  return new AnnouncementDelivery(options);
}

export function getEventDeliveryPriority(eventType: AnnounceEventType): number {
  switch (eventType) {
    case 'completed':
    case 'failed':
    case 'cancelled':
      return 0;
    case 'spawned':
    case 'started':
      return 1;
    case 'paused':
    case 'resumed':
      return 2;
    case 'progress':
      return 3;
    default:
      return 4;
  }
}

export function shouldSuppressAnnouncement(
  announcement: SubagentAnnouncement,
  lastAnnouncement?: SubagentAnnouncement,
): boolean {
  if (!lastAnnouncement) return false;

  if (announcement.eventType !== 'progress') return false;
  if (lastAnnouncement.eventType !== 'progress') return false;

  if (announcement.instanceId !== lastAnnouncement.instanceId) return false;

  const timeDiff = announcement.timestamp - lastAnnouncement.timestamp;
  if (timeDiff < 500) return true;

  if (
    announcement.progress !== undefined &&
    lastAnnouncement.progress !== undefined
  ) {
    const progressDiff = Math.abs(announcement.progress - lastAnnouncement.progress);
    if (progressDiff < 1) return true;
  }

  return false;
}
