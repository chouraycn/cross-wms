// 持久化排队的会话交付以便重试和恢复。
// 移植自 openclaw/src/infra/session-delivery-queue-storage.ts（降级实现）。
//
// 降级说明：
//  - ../channels/chat-type.js 未移植，ChatType 类型内联降级定义
//  - ./delivery-queue-sqlite.js、./secure-random.js 均为已移植模块
import { createHash } from "node:crypto";
import {
  deleteDeliveryQueueEntry,
  loadDeliveryQueueEntries,
  loadDeliveryQueueEntry,
  moveDeliveryQueueEntryToFailed,
  updateDeliveryQueueEntry,
  upsertDeliveryQueueEntry,
  type DeliveryQueueRowMetadata,
} from "./delivery-queue-sqlite.js";
import { generateSecureUuid } from "./secure-random.js";

// 降级：ChatType 类型内联定义（来自 ../channels/chat-type.js）
type ChatType = "direct" | "group" | "channel";

// 会话交付队列持久化 session 范围的消息，直到 channel 交付确认它们
// 或恢复耗尽重试策略。
const QUEUE_NAME = "session";

type SessionDeliveryContext = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
};

type SessionDeliveryRetryPolicy = {
  maxRetries?: number;
};

export type SessionDeliveryRoute = {
  channel: string;
  to: string;
  accountId?: string;
  replyToId?: string;
  threadId?: string;
  chatType: ChatType;
};

/** 可由会话交付恢复重放的 payload 变体。 */
export type QueuedSessionDeliveryPayload =
  | ({
      kind: "systemEvent";
      sessionKey: string;
      text: string;
      deliveryContext?: SessionDeliveryContext;
      idempotencyKey?: string;
    } & SessionDeliveryRetryPolicy)
  | ({
      kind: "agentTurn";
      sessionKey: string;
      message: string;
      messageId: string;
      expectedSessionId?: string;
      route?: SessionDeliveryRoute;
      deliveryContext?: SessionDeliveryContext;
      idempotencyKey?: string;
    } & SessionDeliveryRetryPolicy);

export type QueuedSessionDelivery = QueuedSessionDeliveryPayload & {
  id: string;
  enqueuedAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
};

function buildEntryId(idempotencyKey?: string): string {
  if (!idempotencyKey) {
    return generateSecureUuid();
  }
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

function queuedSessionDeliveryMetadata(entry: QueuedSessionDelivery): DeliveryQueueRowMetadata {
  const route = entry.kind === "agentTurn" ? entry.route : undefined;
  return {
    entryKind: entry.kind,
    sessionKey: entry.sessionKey,
    channel: route?.channel ?? entry.deliveryContext?.channel,
    target: route?.to ?? entry.deliveryContext?.to,
    accountId: route?.accountId ?? entry.deliveryContext?.accountId,
  };
}

/** 入队会话交付并返回其持久化 id。 */
export async function enqueueSessionDelivery(
  params: QueuedSessionDeliveryPayload,
  stateDir?: string,
): Promise<string> {
  const id = buildEntryId(params.idempotencyKey);

  if (params.idempotencyKey && loadDeliveryQueueEntry(QUEUE_NAME, id, stateDir)) {
    return id;
  }

  const entry: QueuedSessionDelivery = {
    ...params,
    id,
    enqueuedAt: Date.now(),
    retryCount: 0,
  };
  upsertDeliveryQueueEntry({
    queueName: QUEUE_NAME,
    entry,
    metadata: queuedSessionDeliveryMetadata(entry),
    stateDir,
  });
  return id;
}

/** 确认成功交付的会话条目。 */
export async function ackSessionDelivery(id: string, stateDir?: string): Promise<void> {
  deleteDeliveryQueueEntry(QUEUE_NAME, id, stateDir);
}

/** 记录失败的交付尝试并增加重试元数据。 */
export async function failSessionDelivery(
  id: string,
  error: string,
  stateDir?: string,
): Promise<void> {
  updateDeliveryQueueEntry(QUEUE_NAME, id, stateDir, (entry) => {
    const queued = entry as QueuedSessionDelivery;
    return {
      ...queued,
      retryCount: queued.retryCount + 1,
      lastAttemptAt: Date.now(),
      lastError: error,
    };
  });
}

/** 按持久化 id 加载单个待处理会话交付。 */
export async function loadPendingSessionDelivery(
  id: string,
  stateDir?: string,
): Promise<QueuedSessionDelivery | null> {
  return loadDeliveryQueueEntry(QUEUE_NAME, id, stateDir) as QueuedSessionDelivery | null;
}

/** 按重试顺序加载所有待处理会话交付。 */
export async function loadPendingSessionDeliveries(
  stateDir?: string,
): Promise<QueuedSessionDelivery[]> {
  return loadDeliveryQueueEntries(QUEUE_NAME, stateDir) as QueuedSessionDelivery[];
}

/** 将耗尽的会话交付移出待处理队列。 */
export async function moveSessionDeliveryToFailed(id: string, stateDir?: string): Promise<void> {
  moveDeliveryQueueEntryToFailed(QUEUE_NAME, id, stateDir);
}
