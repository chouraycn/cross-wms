import { logger } from "../../../logger.js";
import type { ChannelMessage, MessageEnvelope } from "./types.js";
import { advanceMessagePhase } from "./lifecycle.js";
import { receiveMessage } from "./receive.js";

export interface IngressQueueOptions {
  maxSize?: number;
  concurrency?: number;
  retryDelayMs?: number;
  maxRetries?: number;
}

export interface QueuedMessage {
  envelope: MessageEnvelope;
  retries: number;
  queuedAt: number;
  nextRetryAt?: number;
}

type MessageHandler = (message: ChannelMessage) => Promise<void>;

let queue: QueuedMessage[] = [];
let processing = false;
let handler: MessageHandler | null = null;
let options: Required<IngressQueueOptions> = {
  maxSize: 1000,
  concurrency: 5,
  retryDelayMs: 1000,
  maxRetries: 3,
};
let activeCount = 0;

export function configureIngressQueue(opts: IngressQueueOptions): void {
  options = { ...options, ...opts };
  logger.debug(`[Message:IngressQueue] Configured: maxSize=${options.maxSize}, concurrency=${options.concurrency}`);
}

export function setIngressMessageHandler(h: MessageHandler): void {
  handler = h;
}

export function enqueueInboundMessage(envelope: MessageEnvelope): boolean {
  if (queue.length >= options.maxSize) {
    logger.warn(`[Message:IngressQueue] Queue full, dropping message ${envelope.messageId}`);
    return false;
  }

  queue.push({
    envelope,
    retries: 0,
    queuedAt: Date.now(),
  });

  advanceMessagePhase(envelope.messageId, "queued");

  logger.debug(`[Message:IngressQueue] Enqueued ${envelope.messageId}, queue size: ${queue.length}`);

  processQueue();
  return true;
}

export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0 && activeCount < options.concurrency) {
      const now = Date.now();
      const idx = queue.findIndex((m) => !m.nextRetryAt || m.nextRetryAt <= now);

      if (idx === -1) break;

      const queued = queue.splice(idx, 1)[0];
      activeCount++;

      processOne(queued).finally(() => {
        activeCount--;
        processQueue();
      });
    }
  } finally {
    processing = false;
  }
}

async function processOne(queued: QueuedMessage): Promise<void> {
  const { envelope } = queued;

  advanceMessagePhase(envelope.messageId, "processing");

  try {
    const message = await receiveMessage(envelope);

    if (!message) {
      return;
    }

    if (handler) {
      await handler(message);
    }

    advanceMessagePhase(envelope.messageId, "acknowledged");
  } catch (err) {
    logger.error(`[Message:IngressQueue] Error processing ${envelope.messageId}`, { error: err });

    if (queued.retries < options.maxRetries) {
      queued.retries++;
      queued.nextRetryAt = Date.now() + options.retryDelayMs * queued.retries;
      queue.push(queued);
      logger.warn(`[Message:IngressQueue] Retry ${queued.retries}/${options.maxRetries} for ${envelope.messageId}`);
    } else {
      advanceMessagePhase(envelope.messageId, "failed", { error: err });
    }
  }
}

export function getIngressQueueSize(): number {
  return queue.length;
}

export function getActiveProcessingCount(): number {
  return activeCount;
}

export function clearIngressQueue(): void {
  queue = [];
  logger.debug(`[Message:IngressQueue] Queue cleared`);
}
