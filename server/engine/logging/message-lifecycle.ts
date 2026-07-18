import { formatTimestamp } from './timestamps.js';

export type MessageLifecycleStage =
  | 'created'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'archived';

export interface MessageLifecycleEvent {
  messageId: string;
  stage: MessageLifecycleStage;
  timestamp: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export class MessageLifecycleTracker {
  private readonly events: MessageLifecycleEvent[] = [];
  private readonly startTime: Map<string, number> = new Map();
  private readonly messageIds: Set<string> = new Set();

  trackStage(messageId: string, stage: MessageLifecycleStage, metadata?: Record<string, unknown>): void {
    const now = Date.now();
    const event: MessageLifecycleEvent = {
      messageId,
      stage,
      timestamp: formatTimestamp(new Date(now), { style: 'long' }),
      metadata,
    };

    if (stage === 'created') {
      this.startTime.set(messageId, now);
      this.messageIds.add(messageId);
    }

    const startTime = this.startTime.get(messageId);
    if (startTime !== undefined && stage !== 'created') {
      event.durationMs = now - startTime;
    }

    this.events.push(event);
  }

  getEvents(messageId?: string): MessageLifecycleEvent[] {
    if (!messageId) {
      return [...this.events];
    }
    return this.events.filter(e => e.messageId === messageId);
  }

  getDuration(messageId: string): number | undefined {
    const startTime = this.startTime.get(messageId);
    if (startTime === undefined) return undefined;
    return Date.now() - startTime;
  }

  getActiveCount(): number {
    return this.messageIds.size;
  }

  clear(messageId?: string): void {
    if (messageId) {
      this.startTime.delete(messageId);
      this.messageIds.delete(messageId);
      const idx = this.events.findIndex(e => e.messageId === messageId);
      if (idx !== -1) {
        this.events.splice(idx, this.events.filter(e => e.messageId === messageId).length);
      }
    } else {
      this.events.length = 0;
      this.startTime.clear();
      this.messageIds.clear();
    }
  }
}

export const messageLifecycle = new MessageLifecycleTracker();

export function trackMessageStage(
  messageId: string,
  stage: MessageLifecycleStage,
  metadata?: Record<string, unknown>,
): void {
  messageLifecycle.trackStage(messageId, stage, metadata);
}
