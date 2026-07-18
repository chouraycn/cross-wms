import { logger } from '../../logger.js';
import type { ReplyPayload } from './types.js';

export type InboundMessage = {
  id?: string;
  text: string;
  from?: string;
  to?: string;
  channel?: string;
  sessionKey?: string;
  timestamp?: number;
  chatType?: 'direct' | 'group' | 'channel';
  isFromMe?: boolean;
  metadata?: Record<string, unknown>;
};

export type InboundProcessOptions = {
  debounceMs?: number;
  maxQueueSize?: number;
  dedupe?: boolean;
};

export type InboundProcessResult = {
  accepted: boolean;
  reason?: string;
  message?: InboundMessage;
  queueSize?: number;
};

type QueuedMessage = {
  message: InboundMessage;
  timestamp: number;
  resolved: boolean;
};

const messageQueues = new Map<string, QueuedMessage[]>();
const lastMessageByKey = new Map<string, { text: string; timestamp: number }>();
const processingSessions = new Set<string>();

function getQueueKey(message: InboundMessage): string {
  return message.sessionKey || message.channel || 'default';
}

function deduplicate(message: InboundMessage): boolean {
  const key = getQueueKey(message);
  const last = lastMessageByKey.get(key);
  const now = Date.now();

  if (last && last.text === message.text && now - last.timestamp < 5000) {
    return true;
  }

  lastMessageByKey.set(key, { text: message.text, timestamp: now });
  return false;
}

export function queueInboundMessage(
  message: InboundMessage,
  options: InboundProcessOptions = {},
): InboundProcessResult {
  const key = getQueueKey(message);

  if (options.dedupe && deduplicate(message)) {
    logger.debug(`[AutoReply] Deduplicated inbound message for ${key}`);
    return { accepted: false, reason: 'duplicate' };
  }

  let queue = messageQueues.get(key);
  if (!queue) {
    queue = [];
    messageQueues.set(key, queue);
  }

  if (options.maxQueueSize && queue.length >= options.maxQueueSize) {
    logger.warn(`[AutoReply] Queue full for ${key}, dropping message`);
    return { accepted: false, reason: 'queue_full', queueSize: queue.length };
  }

  queue.push({
    message,
    timestamp: Date.now(),
    resolved: false,
  });

  logger.debug(`[AutoReply] Queued message for ${key}, queue size: ${queue.length}`);
  return { accepted: true, queueSize: queue.length, message };
}

export function getNextQueuedMessage(sessionKey: string): InboundMessage | undefined {
  const queue = messageQueues.get(sessionKey);
  if (!queue || queue.length === 0) return undefined;

  const next = queue.shift();
  if (queue.length === 0) {
    messageQueues.delete(sessionKey);
  }

  return next?.message;
}

export function getQueueSize(sessionKey: string): number {
  return messageQueues.get(sessionKey)?.length ?? 0;
}

export function clearQueue(sessionKey: string): void {
  messageQueues.delete(sessionKey);
}

export function isProcessing(sessionKey: string): boolean {
  return processingSessions.has(sessionKey);
}

export function markProcessing(sessionKey: string, processing: boolean): void {
  if (processing) {
    processingSessions.add(sessionKey);
  } else {
    processingSessions.delete(sessionKey);
  }
}

export function validateInboundMessage(message: InboundMessage): {
  valid: boolean;
  reason?: string;
} {
  if (!message.text || !message.text.trim()) {
    return { valid: false, reason: 'empty_text' };
  }
  return { valid: true };
}

export function normalizeInboundText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ')
    .trim();
}

export type ProcessInboundCallback = (
  message: InboundMessage,
) => Promise<ReplyPayload | ReplyPayload[] | undefined>;

export async function processInboundQueue(
  sessionKey: string,
  callback: ProcessInboundCallback,
): Promise<ReplyPayload[]> {
  if (isProcessing(sessionKey)) {
    logger.debug(`[AutoReply] Already processing ${sessionKey}, skipping`);
    return [];
  }

  markProcessing(sessionKey, true);
  const results: ReplyPayload[] = [];

  try {
    let message = getNextQueuedMessage(sessionKey);
    while (message) {
      try {
        const result = await callback(message);
        if (Array.isArray(result)) {
          results.push(...result);
        } else if (result) {
          results.push(result);
        }
      } catch (err) {
        logger.error(`[AutoReply] Error processing message for ${sessionKey}:`, err);
      }
      message = getNextQueuedMessage(sessionKey);
    }
  } finally {
    markProcessing(sessionKey, false);
  }

  return results;
}
