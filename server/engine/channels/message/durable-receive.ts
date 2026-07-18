import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { MessageEnvelope, ChannelMessage } from "./types.js";

export type DurableReceiveStatus = "pending" | "processing" | "acknowledged" | "dead_letter";

export interface DurableMessageRecord {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  payload: unknown;
  status: DurableReceiveStatus;
  receivedAt: number;
  processedAt?: number;
  acknowledgedAt?: number;
  retries: number;
  maxRetries: number;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

const durableStore = new Map<string, DurableMessageRecord>();
const deadLetterStore = new Map<string, DurableMessageRecord>();

export interface DurableReceiveOptions {
  maxRetries?: number;
  visibilityTimeoutMs?: number;
  dlqOnMaxRetries?: boolean;
}

const defaultOptions: Required<DurableReceiveOptions> = {
  maxRetries: 5,
  visibilityTimeoutMs: 30000,
  dlqOnMaxRetries: true,
};

export function receiveDurable(
  envelope: MessageEnvelope,
  options: DurableReceiveOptions = {}
): DurableMessageRecord {
  const opts = { ...defaultOptions, ...options };

  const record: DurableMessageRecord = {
    id: envelope.messageId,
    channelId: envelope.channelId,
    accountId: envelope.accountId,
    payload: envelope.payload,
    status: "pending",
    receivedAt: Date.now(),
    retries: 0,
    maxRetries: opts.maxRetries,
    metadata: envelope.metadata,
  };

  durableStore.set(record.id, record);
  logger.debug(`[Message:DurableReceive] Stored durable message ${record.id}`);

  return record;
}

export function getDurableMessage(id: string): DurableMessageRecord | undefined {
  return durableStore.get(id);
}

export function markProcessing(id: string): boolean {
  const record = durableStore.get(id);
  if (!record || record.status !== "pending") return false;

  record.status = "processing";
  record.processedAt = Date.now();
  return true;
}

export function acknowledgeDurable(id: string): boolean {
  const record = durableStore.get(id);
  if (!record) return false;

  record.status = "acknowledged";
  record.acknowledgedAt = Date.now();
  durableStore.delete(id);

  logger.debug(`[Message:DurableReceive] Acknowledged ${id}`);
  return true;
}

export function negativeAcknowledgeDurable(id: string, error?: string): boolean {
  const record = durableStore.get(id);
  if (!record) return false;

  record.retries++;
  record.lastError = error;

  if (record.retries >= record.maxRetries) {
    record.status = "dead_letter";
    durableStore.delete(id);
    deadLetterStore.set(id, record);
    logger.error(`[Message:DurableReceive] Message ${id} moved to DLQ after ${record.retries} retries`);
  } else {
    record.status = "pending";
    logger.warn(`[Message:DurableReceive] Nack ${id}, retry ${record.retries}/${record.maxRetries}`);
  }

  return true;
}

export function getPendingDurableMessages(channelId?: ChannelId): DurableMessageRecord[] {
  const records = Array.from(durableStore.values()).filter((r) => r.status === "pending");
  if (channelId) {
    return records.filter((r) => r.channelId === channelId);
  }
  return records;
}

export function getDeadLetterMessages(channelId?: ChannelId): DurableMessageRecord[] {
  const records = Array.from(deadLetterStore.values());
  if (channelId) {
    return records.filter((r) => r.channelId === channelId);
  }
  return records;
}

export function reprocessDeadLetter(id: string): boolean {
  const record = deadLetterStore.get(id);
  if (!record) return false;

  record.status = "pending";
  record.retries = 0;
  record.lastError = undefined;

  deadLetterStore.delete(id);
  durableStore.set(id, record);

  logger.info(`[Message:DurableReceive] Reprocessed DLQ message ${id}`);
  return true;
}

export function clearDurableStore(): void {
  durableStore.clear();
  deadLetterStore.clear();
}

export function getDurableStats(): {
  pending: number;
  processing: number;
  deadLetter: number;
  total: number;
} {
  let pending = 0;
  let processing = 0;

  for (const record of durableStore.values()) {
    if (record.status === "pending") pending++;
    else if (record.status === "processing") processing++;
  }

  return {
    pending,
    processing,
    deadLetter: deadLetterStore.size,
    total: durableStore.size + deadLetterStore.size,
  };
}
