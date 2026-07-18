// 在 SQLite 中存储持久化交付队列条目。
// 移植自 openclaw/src/infra/delivery-queue-sqlite.ts（降级实现）。
//
// 降级说明：
//  - ../state/openclaw-state-db.js 未移植，降级为文件 JSON 持久化
//  - ./kysely-sync.js 保留类型引用但运行时降级
//  - 状态持久化到 ${stateDir}/delivery-queue-<queueName>.json
//  - 完整保留所有类型定义，供 session-delivery-queue-storage 等模块依赖
import path from "node:path";
import { resolveStateDir, tryReadJsonFileSync, writeJsonFileSync } from "./_runtime-stubs.js";

// 通用持久化交付队列存储，session 和 outbound 队列共享。
// 队列特定包装器拥有 payload 形状；此层拥有 SQLite 状态。
type QueueStatus = "pending" | "failed";

/** 从队列 payload 中提取的索引元数据，用于诊断和恢复。 */
export type DeliveryQueueRowMetadata = {
  entryKind?: string;
  sessionKey?: string;
  channel?: string;
  target?: string;
  accountId?: string;
};

/** 所有交付队列 payload 共有的持久化队列条目字段。 */
export type DeliveryQueueEntryState = {
  id: string;
  enqueuedAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
  platformSendStartedAt?: number;
  recoveryState?: string;
};

type QueueRow = {
  id: string;
  queue_name?: string;
  entry_json: string;
  enqueued_at: number | bigint;
  retry_count: number | bigint;
  last_attempt_at: number | bigint | null;
  last_error: string | null;
  platform_send_started_at: number | bigint | null;
  recovery_state: string | null;
  status: QueueStatus;
  entry_kind: string | null;
  session_key: string | null;
  channel: string | null;
  target: string | null;
  account_id: string | null;
  updated_at: number;
  failed_at: number | null;
};

type PersistedQueueState = {
  queueName: string;
  entries: QueueRow[];
};

// ============================================================================
// 文件 JSON 持久化（降级 openclaw-state-db）
// ============================================================================

function resolveQueueStatePath(queueName: string, stateDir?: string): string {
  const root = stateDir ?? resolveStateDir();
  return path.join(root, `delivery-queue-${queueName}.json`);
}

function loadQueueState(queueName: string, stateDir?: string): PersistedQueueState {
  const filePath = resolveQueueStatePath(queueName, stateDir);
  const state = tryReadJsonFileSync<PersistedQueueState>(filePath);
  return state ?? { queueName, entries: [] };
}

function saveQueueState(state: PersistedQueueState, stateDir?: string): void {
  const filePath = resolveQueueStatePath(state.queueName, stateDir);
  writeJsonFileSync(filePath, state, { trailingNewline: true });
}

function enoent(queueName: string, id: string): Error & { code: string } {
  const err = new Error(`No pending ${queueName} delivery queue entry ${id}`) as Error & {
    code: string;
  };
  err.code = "ENOENT";
  return err;
}

function inflate(row: QueueRow): DeliveryQueueEntryState {
  return {
    ...(JSON.parse(row.entry_json) as DeliveryQueueEntryState),
    id: row.id,
    enqueuedAt: Number(row.enqueued_at),
    retryCount: Number(row.retry_count),
    ...(row.last_attempt_at == null ? {} : { lastAttemptAt: Number(row.last_attempt_at) }),
    ...(row.last_error == null ? {} : { lastError: row.last_error }),
    ...(row.platform_send_started_at == null
      ? {}
      : { platformSendStartedAt: Number(row.platform_send_started_at) }),
    ...(row.recovery_state == null ? {} : { recoveryState: row.recovery_state }),
  };
}

function metadata(entry: DeliveryQueueEntryState): DeliveryQueueRowMetadata {
  const item = entry as DeliveryQueueEntryState & {
    kind?: string;
    sessionKey?: string;
    channel?: string;
    to?: string;
    accountId?: string;
    session?: { key?: string };
    route?: { channel?: string; to?: string; accountId?: string };
    deliveryContext?: { channel?: string; to?: string; accountId?: string };
  };
  return {
    entryKind: item.kind,
    sessionKey: item.sessionKey ?? item.session?.key,
    channel: item.channel ?? item.route?.channel ?? item.deliveryContext?.channel,
    target: item.to ?? item.route?.to ?? item.deliveryContext?.to,
    accountId: item.accountId ?? item.route?.accountId ?? item.deliveryContext?.accountId,
  };
}

function findEntryIndex(state: PersistedQueueState, id: string, status?: QueueStatus): number {
  return state.entries.findIndex(
    (row) => row.id === id && (status === undefined || row.status === status),
  );
}

/** 在队列命名空间下插入或替换交付队列条目。 */
export function upsertDeliveryQueueEntry(params: {
  queueName: string;
  entry: DeliveryQueueEntryState;
  metadata?: DeliveryQueueRowMetadata;
  status?: QueueStatus;
  stateDir?: string;
}): void {
  const now = Date.now();
  const status = params.status ?? "pending";
  const meta = params.metadata ?? metadata(params.entry);
  const state = loadQueueState(params.queueName, params.stateDir);
  const existingIndex = findEntryIndex(state, params.entry.id);
  const row: QueueRow = {
    id: params.entry.id,
    queue_name: params.queueName,
    status,
    entry_kind: meta.entryKind ?? null,
    session_key: meta.sessionKey ?? null,
    channel: meta.channel ?? null,
    target: meta.target ?? null,
    account_id: meta.accountId ?? null,
    retry_count: params.entry.retryCount,
    last_attempt_at: params.entry.lastAttemptAt ?? null,
    last_error: params.entry.lastError ?? null,
    recovery_state: params.entry.recoveryState ?? null,
    platform_send_started_at: params.entry.platformSendStartedAt ?? null,
    entry_json: JSON.stringify(params.entry),
    enqueued_at: params.entry.enqueuedAt,
    updated_at: now,
    failed_at: status === "failed" ? now : null,
  };
  if (existingIndex >= 0) {
    state.entries[existingIndex] = row;
  } else {
    state.entries.push(row);
  }
  saveQueueState(state, params.stateDir);
}

/** 加载单个待处理交付队列条目。 */
export function loadDeliveryQueueEntry(
  queueName: string,
  id: string,
  stateDir?: string,
): DeliveryQueueEntryState | null {
  const state = loadQueueState(queueName, stateDir);
  const row = state.entries.find((entry) => entry.id === id && entry.status === "pending");
  return row ? inflate(row) : null;
}

/** 按数据库顺序加载队列命名空间的所有待处理条目。 */
export function loadDeliveryQueueEntries(
  queueName: string,
  stateDir?: string,
): DeliveryQueueEntryState[] {
  const state = loadQueueState(queueName, stateDir);
  return state.entries
    .filter((entry) => entry.status === "pending")
    .sort((a, b) => Number(a.enqueued_at) - Number(b.enqueued_at) || a.id.localeCompare(b.id))
    .map(inflate);
}

/** 成功交付后删除待处理交付队列条目。 */
export function deleteDeliveryQueueEntry(queueName: string, id: string, stateDir?: string): void {
  const state = loadQueueState(queueName, stateDir);
  const index = findEntryIndex(state, id, "pending");
  if (index >= 0) {
    state.entries.splice(index, 1);
    saveQueueState(state, stateDir);
  }
}

/** 加载、转换并持久化待处理交付队列条目。 */
export function updateDeliveryQueueEntry(
  queueName: string,
  id: string,
  stateDir: string | undefined,
  update: (entry: DeliveryQueueEntryState) => DeliveryQueueEntryState,
): void {
  const current = loadDeliveryQueueEntry(queueName, id, stateDir);
  if (!current) {
    throw enoent(queueName, id);
  }
  upsertDeliveryQueueEntry({ queueName, entry: update(current), stateDir });
}

/** 将待处理交付队列条目标记为失败以便后续诊断。 */
export function moveDeliveryQueueEntryToFailed(
  queueName: string,
  id: string,
  stateDir?: string,
): void {
  const current = loadDeliveryQueueEntry(queueName, id, stateDir);
  if (!current) {
    throw enoent(queueName, id);
  }
  upsertDeliveryQueueEntry({ queueName, entry: current, status: "failed", stateDir });
}
