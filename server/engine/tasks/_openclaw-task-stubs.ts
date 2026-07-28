/**
 * SQLite-backed 实现 — 为移植自 openclaw 的 tasks/ 模块提供持久化与查询能力。
 *
 * 设计说明：
 *  - SQLite 函数直接使用 better-sqlite3 prepared statements，绕过降级的 Kysely 层
 *    （kysely-sync.ts 的 executeSqliteQuerySync 返回空结果集，无法使用）
 *  - task-registry 查询函数直接从 SQLite 读取，无需维护进程内索引
 *  - 写操作在事务中执行，保证原子性
 *  - 尚未移植的模块（task-flow-registry、task-executor 等）保留 stub 占位
 *
 * 参考 openclaw/src/tasks/{task-registry,task-registry.store.sqlite,
 * runtime-internal,task-flow-registry,task-flow-registry.audit,task-executor}.ts
 */
import {
  closeStateDatabase,
  openStateDatabase,
  runStateWriteTransaction,
} from "../state/openclaw-state-db.js";
import { normalizeSqliteNumber } from "../infra/sqlite-number.js";
import { normalizeOptionalString } from "../infra/string-coerce.js";
import { parseDeliveryContextJson } from "./task-registry.sqlite.shared.js";
import { resolveTaskCleanupAfter } from "./task-retention.js";
import type { TaskRegistryStoreSnapshot } from "./task-registry.store.types.js";
import {
  parseOptionalTaskTerminalOutcome,
  parseTaskDeliveryStatus,
  parseTaskNotifyPolicy,
  parseTaskRuntime,
  parseTaskScopeKind,
  parseTaskStatus,
  type TaskDeliveryState,
  type TaskNotifyPolicy,
  type TaskRecord,
  type TaskStatus,
  type TaskTerminalOutcome,
} from "./task-registry.types.js";
import type { TaskFlowRecord, JsonValue } from "./task-flow-registry.types.js";
import type {
  DetachedTaskCancelParams,
  DetachedTaskCancelResult,
  DetachedTaskCompleteParams,
  DetachedTaskCreateParams,
  DetachedTaskDeliveryStatusParams,
  DetachedTaskFailParams,
  DetachedTaskFinalizeParams,
  DetachedTaskProgressParams,
  DetachedRunningTaskCreateParams,
  DetachedTaskStartParams,
} from "./detached-task-runtime-contract.js";

// ============================================================================
// 行类型与常量
// ============================================================================

type TaskRegistryRow = {
  task_id: string;
  runtime: string;
  task_kind: string | null;
  source_id: string | null;
  requester_session_key: string | null;
  owner_key: string;
  scope_kind: string;
  child_session_key: string | null;
  parent_flow_id: string | null;
  parent_task_id: string | null;
  agent_id: string | null;
  requester_agent_id: string | null;
  run_id: string | null;
  label: string | null;
  task: string;
  status: string;
  delivery_status: string;
  notify_policy: string;
  created_at: number | bigint | null;
  started_at: number | bigint | null;
  ended_at: number | bigint | null;
  last_event_at: number | bigint | null;
  cleanup_after: number | bigint | null;
  error: string | null;
  progress_summary: string | null;
  terminal_summary: string | null;
  terminal_outcome: string | null;
};

type TaskDeliveryStateRow = {
  task_id: string;
  requester_origin_json: string | null;
  last_notified_event_at: number | bigint | null;
};

const TASK_RUN_COLUMNS = `task_id, runtime, task_kind, source_id, requester_session_key, owner_key, scope_kind, child_session_key, parent_flow_id, parent_task_id, agent_id, requester_agent_id, run_id, label, task, status, delivery_status, notify_policy, created_at, started_at, ended_at, last_event_at, cleanup_after, error, progress_summary, terminal_summary, terminal_outcome`;

const UPSERT_TASK_SQL = `INSERT OR REPLACE INTO task_runs (${TASK_RUN_COLUMNS}) VALUES (@task_id, @runtime, @task_kind, @source_id, @requester_session_key, @owner_key, @scope_kind, @child_session_key, @parent_flow_id, @parent_task_id, @agent_id, @requester_agent_id, @run_id, @label, @task, @status, @delivery_status, @notify_policy, @created_at, @started_at, @ended_at, @last_event_at, @cleanup_after, @error, @progress_summary, @terminal_summary, @terminal_outcome)`;

const UPSERT_DELIVERY_STATE_SQL = `INSERT OR REPLACE INTO task_delivery_state (task_id, requester_origin_json, last_notified_event_at) VALUES (@task_id, @requester_origin_json, @last_notified_event_at)`;

// ============================================================================
// 行映射辅助
// ============================================================================

function rowToTaskRecord(row: TaskRegistryRow): TaskRecord {
  const startedAt = normalizeSqliteNumber(row.started_at);
  const endedAt = normalizeSqliteNumber(row.ended_at);
  const lastEventAt = normalizeSqliteNumber(row.last_event_at);
  const cleanupAfter = normalizeSqliteNumber(row.cleanup_after);
  const scopeKind = parseTaskScopeKind(row.scope_kind);
  const terminalOutcome = parseOptionalTaskTerminalOutcome(row.terminal_outcome);
  const requesterSessionKey =
    scopeKind === "system" ? "" : row.requester_session_key?.trim() || row.owner_key;
  return {
    taskId: row.task_id,
    runtime: parseTaskRuntime(row.runtime),
    ...(row.task_kind ? { taskKind: row.task_kind } : {}),
    ...(row.source_id ? { sourceId: row.source_id } : {}),
    requesterSessionKey,
    ownerKey: row.owner_key,
    scopeKind,
    ...(row.child_session_key ? { childSessionKey: row.child_session_key } : {}),
    ...(row.parent_flow_id ? { parentFlowId: row.parent_flow_id } : {}),
    ...(row.parent_task_id ? { parentTaskId: row.parent_task_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.requester_agent_id ? { requesterAgentId: row.requester_agent_id } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.label ? { label: row.label } : {}),
    task: row.task,
    status: parseTaskStatus(row.status),
    deliveryStatus: parseTaskDeliveryStatus(row.delivery_status),
    notifyPolicy: parseTaskNotifyPolicy(row.notify_policy),
    createdAt: normalizeSqliteNumber(row.created_at) ?? 0,
    ...(startedAt != null ? { startedAt } : {}),
    ...(endedAt != null ? { endedAt } : {}),
    ...(lastEventAt != null ? { lastEventAt } : {}),
    ...(cleanupAfter != null ? { cleanupAfter } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.progress_summary ? { progressSummary: row.progress_summary } : {}),
    ...(row.terminal_summary ? { terminalSummary: row.terminal_summary } : {}),
    ...(terminalOutcome ? { terminalOutcome } : {}),
  };
}

function rowToTaskDeliveryState(row: TaskDeliveryStateRow): TaskDeliveryState {
  const requesterOrigin = parseDeliveryContextJson(row.requester_origin_json);
  const lastNotifiedEventAt = normalizeSqliteNumber(row.last_notified_event_at);
  return {
    taskId: row.task_id,
    ...(requesterOrigin ? { requesterOrigin } : {}),
    ...(lastNotifiedEventAt != null ? { lastNotifiedEventAt } : {}),
  };
}

function bindTaskRecord(record: TaskRecord): Record<string, unknown> {
  return {
    task_id: record.taskId,
    runtime: record.runtime,
    task_kind: record.taskKind ?? null,
    source_id: record.sourceId ?? null,
    requester_session_key: record.scopeKind === "system" ? "" : record.requesterSessionKey,
    owner_key: record.ownerKey,
    scope_kind: record.scopeKind,
    child_session_key: record.childSessionKey ?? null,
    parent_flow_id: record.parentFlowId ?? null,
    parent_task_id: record.parentTaskId ?? null,
    agent_id: record.agentId ?? null,
    requester_agent_id: record.requesterAgentId ?? null,
    run_id: record.runId ?? null,
    label: record.label ?? null,
    task: record.task,
    status: record.status,
    delivery_status: record.deliveryStatus,
    notify_policy: record.notifyPolicy,
    created_at: record.createdAt,
    started_at: record.startedAt ?? null,
    ended_at: record.endedAt ?? null,
    last_event_at: record.lastEventAt ?? null,
    cleanup_after: record.cleanupAfter ?? null,
    error: record.error ?? null,
    progress_summary: record.progressSummary ?? null,
    terminal_summary: record.terminalSummary ?? null,
    terminal_outcome: record.terminalOutcome ?? null,
  };
}

function bindTaskDeliveryState(state: TaskDeliveryState): Record<string, unknown> {
  return {
    task_id: state.taskId,
    requester_origin_json: state.requesterOrigin ? JSON.stringify(state.requesterOrigin) : null,
    last_notified_event_at: state.lastNotifiedEventAt ?? null,
  };
}

// ============================================================================
// task-registry.store.sqlite.ts — SQLite 持久化（better-sqlite3 直接实现）
// ============================================================================

/** 从 SQLite 加载任务注册表完整快照。 */
export function loadTaskRegistryStateFromSqlite(): TaskRegistryStoreSnapshot {
  const { db } = openStateDatabase();
  const taskRows = db.prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs ORDER BY created_at ASC, task_id ASC`).all() as TaskRegistryRow[];
  const deliveryRows = db
    .prepare("SELECT task_id, requester_origin_json, last_notified_event_at FROM task_delivery_state ORDER BY task_id ASC")
    .all() as TaskDeliveryStateRow[];
  return {
    tasks: new Map(taskRows.map((row) => [row.task_id, rowToTaskRecord(row)])),
    deliveryStates: new Map(deliveryRows.map((row) => [row.task_id, rowToTaskDeliveryState(row)])),
  };
}

/** 保存任务注册表快照到 SQLite（事务内 upsert 全部记录）。 */
export function saveTaskRegistryStateToSqlite(snapshot: TaskRegistryStoreSnapshot): void {
  runStateWriteTransaction(({ db }) => {
    if (snapshot.tasks.size === 0) {
      db.prepare("DELETE FROM task_delivery_state").run();
      db.prepare("DELETE FROM task_runs").run();
      return;
    }
    const upsertTask = db.prepare(UPSERT_TASK_SQL);
    const upsertDelivery = db.prepare(UPSERT_DELIVERY_STATE_SQL);
    for (const task of snapshot.tasks.values()) {
      upsertTask.run(bindTaskRecord(task));
    }
    for (const state of snapshot.deliveryStates.values()) {
      upsertDelivery.run(bindTaskDeliveryState(state));
    }
  });
}

/** 按 ownerKey 从 SQLite 列出任务记录。 */
export function listTaskRegistryRecordsByOwnerKeyFromSqlite(ownerKey: string): TaskRecord[] {
  const key = ownerKey.trim();
  if (!key) {
    return [];
  }
  const { db } = openStateDatabase();
  const rows = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE owner_key = ? ORDER BY created_at ASC, task_id ASC`)
    .all(key) as TaskRegistryRow[];
  return rows.map(rowToTaskRecord);
}

/** 插入或更新单条任务记录到 SQLite。 */
export function upsertTaskRegistryRecordToSqlite(task: TaskRecord): void {
  runStateWriteTransaction(({ db }) => {
    db.prepare(UPSERT_TASK_SQL).run(bindTaskRecord(task));
  });
}

/** 插入或更新任务+投递状态到 SQLite（单事务原子写入）。 */
export function upsertTaskWithDeliveryStateToSqlite(params: {
  task: TaskRecord;
  deliveryState?: TaskDeliveryState;
}): void {
  runStateWriteTransaction(({ db }) => {
    db.prepare(UPSERT_TASK_SQL).run(bindTaskRecord(params.task));
    if (params.deliveryState) {
      db.prepare(UPSERT_DELIVERY_STATE_SQL).run(bindTaskDeliveryState(params.deliveryState));
    } else {
      db.prepare("DELETE FROM task_delivery_state WHERE task_id = ?").run(params.task.taskId);
    }
  });
}

/** 从 SQLite 删除任务记录。 */
export function deleteTaskRegistryRecordFromSqlite(taskId: string): void {
  runStateWriteTransaction(({ db }) => {
    db.prepare("DELETE FROM task_runs WHERE task_id = ?").run(taskId);
  });
}

/** 从 SQLite 删除任务记录及其投递状态（单事务）。 */
export function deleteTaskAndDeliveryStateFromSqlite(taskId: string): void {
  runStateWriteTransaction(({ db }) => {
    db.prepare("DELETE FROM task_delivery_state WHERE task_id = ?").run(taskId);
    db.prepare("DELETE FROM task_runs WHERE task_id = ?").run(taskId);
  });
}

/** 插入或更新投递状态到 SQLite。 */
export function upsertTaskDeliveryStateToSqlite(state: TaskDeliveryState): void {
  runStateWriteTransaction(({ db }) => {
    db.prepare(UPSERT_DELIVERY_STATE_SQL).run(bindTaskDeliveryState(state));
  });
}

/** 从 SQLite 删除投递状态。 */
export function deleteTaskDeliveryStateFromSqlite(taskId: string): void {
  runStateWriteTransaction(({ db }) => {
    db.prepare("DELETE FROM task_delivery_state WHERE task_id = ?").run(taskId);
  });
}

/** 关闭 SQLite 数据库。 */
export function closeTaskRegistryDatabase(): void {
  closeStateDatabase();
}

// ============================================================================
// task-registry.ts — 任务注册表查询（直接读取 SQLite，无需进程内索引）
// ============================================================================

function normalizeTaskTimestamps(task: TaskRecord): TaskRecord {
  let createdAt = task.createdAt;
  for (const candidate of [task.startedAt, task.lastEventAt, task.endedAt]) {
    if (typeof candidate === "number" && candidate < createdAt) {
      createdAt = candidate;
    }
  }
  const startedAt =
    typeof task.startedAt === "number" ? Math.max(task.startedAt, createdAt) : task.startedAt;
  const lastEventAt =
    typeof task.lastEventAt === "number"
      ? Math.max(task.lastEventAt, startedAt ?? createdAt)
      : task.lastEventAt;
  const endedAt =
    typeof task.endedAt === "number"
      ? Math.max(task.endedAt, startedAt ?? createdAt)
      : task.endedAt;
  if (
    createdAt === task.createdAt &&
    startedAt === task.startedAt &&
    lastEventAt === task.lastEventAt &&
    endedAt === task.endedAt
  ) {
    return task;
  }
  const normalized: TaskRecord = { ...task, createdAt };
  if (typeof startedAt === "number") normalized.startedAt = startedAt;
  if (typeof lastEventAt === "number") normalized.lastEventAt = lastEventAt;
  if (typeof endedAt === "number") normalized.endedAt = endedAt;
  return normalized;
}

function normalizeTaskSummary(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function normalizeTaskTerminalOutcome(
  value: TaskTerminalOutcome | null | undefined,
): TaskTerminalOutcome | undefined {
  return value === "succeeded" || value === "blocked" ? value : undefined;
}

function resolveTaskTerminalOutcome(params: {
  status: TaskStatus;
  terminalOutcome?: TaskTerminalOutcome | null;
}): TaskTerminalOutcome | undefined {
  const normalized = normalizeTaskTerminalOutcome(params.terminalOutcome);
  if (normalized) {
    return normalized;
  }
  return params.status === "succeeded" ? "succeeded" : undefined;
}

function isTerminalTaskStatus(status: TaskStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "timed_out" ||
    status === "cancelled" ||
    status === "lost"
  );
}

function pickPreferredRunIdTask(matches: TaskRecord[]): TaskRecord | undefined {
  if (matches.length === 0) {
    return undefined;
  }
  return [...matches].sort((left, right) => {
    const leftPriority = left.runtime === "cli" ? 1 : 0;
    const rightPriority = right.runtime === "cli" ? 1 : 0;
    const priorityDiff = leftPriority - rightPriority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return left.createdAt - right.createdAt;
  })[0];
}

/** 按 taskId 获取任务。 */
export function getTaskById(taskId: string): TaskRecord | undefined {
  const trimmed = taskId.trim();
  if (!trimmed) {
    return undefined;
  }
  const { db } = openStateDatabase();
  const row = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE task_id = ?`)
    .get(trimmed) as TaskRegistryRow | undefined;
  return row ? rowToTaskRecord(row) : undefined;
}

/** 按 runId 获取任务（选择优先级最高的匹配）。 */
export function findTaskByRunId(runId: string): TaskRecord | undefined {
  const trimmed = runId.trim();
  if (!trimmed) {
    return undefined;
  }
  const { db } = openStateDatabase();
  const rows = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE run_id = ? ORDER BY created_at ASC`)
    .all(trimmed) as TaskRegistryRow[];
  const matches = rows.map(rowToTaskRecord);
  const task = pickPreferredRunIdTask(matches);
  return task ? { ...task } : undefined;
}

/** 按关联 sessionKey 列出任务。 */
export function listTasksForRelatedSessionKey(sessionKey: string): TaskRecord[] {
  const key = normalizeOptionalString(sessionKey);
  if (!key) {
    return [];
  }
  const { db } = openStateDatabase();
  const rows = db
    .prepare(
      `SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE child_session_key = ? OR (scope_kind = 'session' AND owner_key = ?) OR requester_session_key = ? ORDER BY created_at DESC, task_id ASC`,
    )
    .all(key, key, key) as TaskRegistryRow[];
  return rows.map(rowToTaskRecord);
}

/** 按流程 ID 列出任务。 */
export function listTasksForFlowId(flowId: string): TaskRecord[] {
  const key = flowId.trim();
  if (!key) {
    return [];
  }
  const { db } = openStateDatabase();
  const rows = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE parent_flow_id = ? ORDER BY created_at DESC, task_id ASC`)
    .all(key) as TaskRegistryRow[];
  return rows.map(rowToTaskRecord);
}

/** 列出所有任务记录（按创建时间降序）。 */
export function listTaskRecords(): TaskRecord[] {
  const { db } = openStateDatabase();
  const rows = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs ORDER BY created_at DESC, task_id ASC`)
    .all() as TaskRegistryRow[];
  return rows.map(rowToTaskRecord);
}

/** 标记任务终态：更新 status/endedAt 等，返回更新后的任务或 null（未找到）。 */
export function markTaskTerminalById(params: {
  taskId: string;
  status: Extract<TaskStatus, "succeeded" | "failed" | "timed_out" | "cancelled" | "lost">;
  endedAt: number;
  lastEventAt?: number;
  error?: string;
  terminalSummary?: string | null;
  terminalOutcome?: TaskTerminalOutcome | null;
}): TaskRecord | null {
  const current = getTaskById(params.taskId);
  if (!current) {
    return null;
  }
  const patch: Partial<TaskRecord> = {
    status: params.status,
    endedAt: params.endedAt,
    lastEventAt: params.lastEventAt ?? params.endedAt,
    ...(params.error !== undefined ? { error: params.error } : {}),
    ...(params.terminalSummary !== undefined
      ? { terminalSummary: normalizeTaskSummary(params.terminalSummary) }
      : {}),
    ...(params.terminalOutcome !== undefined
      ? {
          terminalOutcome: resolveTaskTerminalOutcome({
            status: params.status,
            terminalOutcome: params.terminalOutcome,
          }),
        }
      : {}),
  };
  const next = normalizeTaskTimestamps({ ...current, ...patch });
  if (isTerminalTaskStatus(next.status) && typeof next.cleanupAfter !== "number") {
    next.cleanupAfter = resolveTaskCleanupAfter(next);
  }
  upsertTaskRegistryRecordToSqlite(next);
  return { ...next };
}

/** 解析查找令牌对应任务（依次尝试 taskId、runId、关联 sessionKey）。 */
export function resolveTaskForLookupToken(token: string): TaskRecord | undefined {
  const lookup = token.trim();
  if (!lookup) {
    return undefined;
  }
  return (
    getTaskById(lookup) ??
    findTaskByRunId(lookup) ??
    listTasksForRelatedSessionKey(lookup)[0]
  );
}

/** 更新任务通知策略，返回更新后的任务或 null（未找到）。 */
export function updateTaskNotifyPolicyById(params: {
  taskId: string;
  notifyPolicy: TaskNotifyPolicy;
}): TaskRecord | null {
  const current = getTaskById(params.taskId);
  if (!current) {
    return null;
  }
  const next = normalizeTaskTimestamps({
    ...current,
    notifyPolicy: params.notifyPolicy,
    lastEventAt: Date.now(),
  });
  upsertTaskRegistryRecordToSqlite(next);
  return { ...next };
}

// ============================================================================
// runtime-internal.ts — cancelTaskById stub（未移植）
// ============================================================================

/** 取消任务 stub：返回未找到。 */
export async function cancelTaskById(
  _params: DetachedTaskCancelParams,
): Promise<DetachedTaskCancelResult> {
  return { found: false, cancelled: false, reason: "Task not found." };
}

// ============================================================================
// task-flow-registry.ts — 任务流程注册表 stub（未移植，792行）
// ============================================================================

export type FlowRecordPatch = Partial<
  Pick<
    TaskFlowRecord,
    | "status"
    | "notifyPolicy"
    | "goal"
    | "currentStep"
    | "blockedTaskId"
    | "blockedSummary"
    | "controllerId"
    | "stateJson"
    | "waitJson"
    | "cancelRequestedAt"
    | "updatedAt"
    | "endedAt"
  >
> & {
  currentStep?: string | null;
  blockedTaskId?: string | null;
  blockedSummary?: string | null;
  controllerId?: string | null;
  stateJson?: JsonValue | null;
  waitJson?: JsonValue | null;
  cancelRequestedAt?: number | null;
  endedAt?: number | null;
};

export type TaskFlowUpdateResult =
  | {
      applied: true;
      flow: TaskFlowRecord;
    }
  | {
      applied: false;
      reason: "not_found" | "revision_conflict" | "persist_failed";
      current?: TaskFlowRecord;
    };

/** 获取流程记录 stub：返回 undefined。 */
export function getTaskFlowById(_flowId: string): TaskFlowRecord | undefined {
  return undefined;
}

/** 列出所有流程记录 stub：返回空数组。 */
export function listTaskFlowRecords(): TaskFlowRecord[] {
  return [];
}

/** 删除流程记录 stub：返回 false（未找到）。 */
export function deleteTaskFlowRecordById(_flowId: string): boolean {
  return false;
}

/** 期望修订版更新流程记录 stub：返回 not_found。 */
export function updateFlowRecordByIdExpectedRevision(_params: {
  flowId: string;
  expectedRevision: number;
  patch: FlowRecordPatch;
}): TaskFlowUpdateResult {
  return { applied: false, reason: "not_found" };
}

// ============================================================================
// task-flow-registry.audit.ts — 任务流程审计 stub（未移植，288行）
// ============================================================================

export type TaskFlowAuditCode =
  | "restore_failed"
  | "stale_running"
  | "stale_waiting"
  | "stale_blocked"
  | "cancel_stuck"
  | "missing_linked_tasks"
  | "blocked_task_missing"
  | "inconsistent_timestamps";

export type TaskFlowAuditFinding = {
  severity: "warn" | "error";
  code: TaskFlowAuditCode;
  detail: string;
  ageMs?: number;
  flow?: TaskFlowRecord;
};

export type TaskFlowAuditSummary = {
  total: number;
  warnings: number;
  errors: number;
  byCode: Record<TaskFlowAuditCode, number>;
};

/** 列出流程审计发现 stub：返回空数组。 */
export function listTaskFlowAuditFindings(_options?: {
  now?: number;
  flows?: TaskFlowRecord[];
  staleRunningMs?: number;
  staleWaitingMs?: number;
  staleBlockedMs?: number;
  cancelStuckMs?: number;
}): TaskFlowAuditFinding[] {
  return [];
}

/** 汇总流程审计发现 stub：返回空汇总。 */
export function summarizeTaskFlowAuditFindings(
  _findings: Iterable<TaskFlowAuditFinding>,
): TaskFlowAuditSummary {
  return {
    total: 0,
    warnings: 0,
    errors: 0,
    byCode: {
      restore_failed: 0,
      stale_running: 0,
      stale_waiting: 0,
      stale_blocked: 0,
      cancel_stuck: 0,
      missing_linked_tasks: 0,
      blocked_task_missing: 0,
      inconsistent_timestamps: 0,
    },
  };
}

// ============================================================================
// task-executor.ts — 分离任务执行器 stub（cross-wms task-executor.ts 实现不同）
// ============================================================================

/** 创建排队任务运行 stub：返回 null。 */
export function createQueuedTaskRun(_params: DetachedTaskCreateParams): TaskRecord | null {
  return null;
}

/** 创建运行中任务运行 stub：返回 null。 */
export function createRunningTaskRun(
  _params: DetachedRunningTaskCreateParams,
): TaskRecord | null {
  return null;
}

/** 启动任务运行 stub：返回空数组。 */
export function startTaskRunByRunId(_params: DetachedTaskStartParams): TaskRecord[] {
  return [];
}

/** 记录任务进度 stub：返回空数组。 */
export function recordTaskRunProgressByRunId(_params: DetachedTaskProgressParams): TaskRecord[] {
  return [];
}

/** 完成任务运行 stub：返回空数组。 */
export function completeTaskRunByRunId(_params: DetachedTaskCompleteParams): TaskRecord[] {
  return [];
}

/** 失败任务运行 stub：返回空数组。 */
export function failTaskRunByRunId(_params: DetachedTaskFailParams): TaskRecord[] {
  return [];
}

/** 终结任务运行 stub：返回空数组。 */
export function finalizeTaskRunByRunId(_params: DetachedTaskFinalizeParams): TaskRecord[] {
  return [];
}

/** 设置分离任务投递状态 stub：返回空数组。 */
export function setDetachedTaskDeliveryStatusByRunId(
  _params: DetachedTaskDeliveryStatusParams,
): TaskRecord[] {
  return [];
}
