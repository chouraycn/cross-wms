/**
 * SQLite-backed 实现 — 为移植自 openclaw 的 tasks/ 模块提供持久化与查询能力。
 *
 * 设计说明：
 *  - SQLite 函数直接使用 better-sqlite3 prepared statements，绕过降级的 Kysely 层
 *    （kysely-sync.ts 的 executeSqliteQuerySync 返回空结果集，无法使用）
 *  - task-registry 查询函数直接从 SQLite 读取，无需维护进程内索引
 *  - 写操作在事务中执行，保证原子性
 *  - task-executor 函数提供最小可用实现（创建/更新任务记录，不含运行时取消）
 *  - task-flow-registry 函数委托给 ./task-flow-registry.ts（含 SQLite 持久化）
 *  - task-flow-registry.audit 函数委托给 ./task-flow-registry.audit.ts
 *
 * 参考 openclaw/src/tasks/{task-registry,task-registry.store.sqlite,
 * runtime-internal,task-flow-registry,task-flow-registry.audit,task-executor}.ts
 */
import crypto from "node:crypto";
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
  type TaskDeliveryStatus,
  type TaskNotifyPolicy,
  type TaskRecord,
  type TaskRuntime,
  type TaskScopeKind,
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
import {
  deleteTaskFlowRecordById as deleteTaskFlowRecordByIdFromRegistry,
  getTaskFlowById as getTaskFlowByIdFromRegistry,
  listTaskFlowRecords as listTaskFlowRecordsFromRegistry,
  updateFlowRecordByIdExpectedRevision as updateFlowRecordByIdExpectedRevisionFromRegistry,
  type TaskFlowUpdateResult,
} from "./task-flow-registry.js";
import {
  listTaskFlowAuditFindings as listTaskFlowAuditFindingsFromAudit,
  summarizeTaskFlowAuditFindings as summarizeTaskFlowAuditFindingsFromAudit,
  type TaskFlowAuditFinding,
  type TaskFlowAuditSummary,
} from "./task-flow-registry.audit.js";

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
// runtime-internal.ts — cancelTaskById（移植自 openclaw/src/tasks/task-registry.ts）
// ============================================================================
// 简化实现：仅更新注册表状态为 cancelled，不执行运行时特定的取消操作
// （ACP session 取消 / subagent kill / cron abort 等）。
// 运行时取消由 detached-task-runtime.ts 注册的 lifecycle runtime 负责。

/** 取消任务：查找任务并标记为 cancelled。 */
export async function cancelTaskById(
  params: DetachedTaskCancelParams,
): Promise<DetachedTaskCancelResult> {
  const task = getTaskById(params.taskId);
  if (!task) {
    return { found: false, cancelled: false, reason: "Task not found." };
  }
  if (
    task.status === "succeeded" ||
    task.status === "failed" ||
    task.status === "timed_out" ||
    task.status === "lost" ||
    task.status === "cancelled"
  ) {
    return {
      found: true,
      cancelled: false,
      reason: "Task is already terminal.",
      task,
    };
  }
  const now = Date.now();
  const updated = markTaskTerminalById({
    taskId: task.taskId,
    status: "cancelled",
    endedAt: now,
    lastEventAt: now,
    error: params.reason?.trim() || "Cancelled by operator.",
  });
  if (!updated) {
    return {
      found: true,
      cancelled: false,
      reason: "Task persistence failed.",
      task,
    };
  }
  return {
    found: true,
    cancelled: true,
    task: updated,
  };
}

// ============================================================================
// task-flow-registry.ts — 任务流程注册表（委托给 ./task-flow-registry.ts）
// ============================================================================
// 真实实现在 ./task-flow-registry.ts（含 SQLite 持久化），此处仅做委托转发。
// 参考 openclaw/src/tasks/task-flow-registry.ts。

export type { TaskFlowUpdateResult } from "./task-flow-registry.js";

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

/** 获取流程记录：委托给 ./task-flow-registry.ts（含 SQLite 持久化）。 */
export function getTaskFlowById(flowId: string): TaskFlowRecord | undefined {
  return getTaskFlowByIdFromRegistry(flowId);
}

/** 列出所有流程记录：委托给 ./task-flow-registry.ts。 */
export function listTaskFlowRecords(): TaskFlowRecord[] {
  return listTaskFlowRecordsFromRegistry();
}

/** 删除流程记录：委托给 ./task-flow-registry.ts。 */
export function deleteTaskFlowRecordById(flowId: string): boolean {
  return deleteTaskFlowRecordByIdFromRegistry(flowId);
}

/** 期望修订版更新流程记录（带乐观锁）：委托给 ./task-flow-registry.ts。 */
export function updateFlowRecordByIdExpectedRevision(params: {
  flowId: string;
  expectedRevision: number;
  patch: FlowRecordPatch;
}): TaskFlowUpdateResult {
  return updateFlowRecordByIdExpectedRevisionFromRegistry(
    params as Parameters<typeof updateFlowRecordByIdExpectedRevisionFromRegistry>[0],
  );
}

// ============================================================================
// task-flow-registry.audit.ts — 任务流程审计（委托给 ./task-flow-registry.audit.ts）
// ============================================================================
// 真实实现在 ./task-flow-registry.audit.ts，此处仅做委托转发。
// 参考 openclaw/src/tasks/task-flow-registry.audit.ts。

export type {
  TaskFlowAuditCode,
  TaskFlowAuditFinding,
  TaskFlowAuditSummary,
} from "./task-flow-registry.audit.js";

/** 列出流程审计发现：委托给 ./task-flow-registry.audit.ts。 */
export function listTaskFlowAuditFindings(options?: {
  now?: number;
  flows?: TaskFlowRecord[];
  staleRunningMs?: number;
  staleWaitingMs?: number;
  staleBlockedMs?: number;
  cancelStuckMs?: number;
}): TaskFlowAuditFinding[] {
  return listTaskFlowAuditFindingsFromAudit(options);
}

/** 汇总流程审计发现：委托给 ./task-flow-registry.audit.ts。 */
export function summarizeTaskFlowAuditFindings(
  findings: Iterable<TaskFlowAuditFinding>,
): TaskFlowAuditSummary {
  return summarizeTaskFlowAuditFindingsFromAudit(findings);
}

// ============================================================================
// task-executor.ts — 分离任务执行器（移植自 openclaw/src/tasks/task-executor.ts）
// ============================================================================
// 最小可用实现：创建/更新任务记录，通过 SQLite 持久化。
// 不含运行时特定操作（ACP session 管理 / subagent kill / cron abort），
// 这些由 detached-task-runtime.ts 注册的 lifecycle runtime 负责。

/** 解析 ownerKey（移植自 openclaw task-registry.ts resolveTaskOwnerKey）。 */
function resolveTaskOwnerKey(params: {
  requesterSessionKey?: string;
  ownerKey?: string;
}): string {
  const ownerKey = normalizeOptionalString(params.ownerKey);
  if (ownerKey) {
    return ownerKey;
  }
  const sessionKey = normalizeOptionalString(params.requesterSessionKey);
  return sessionKey ?? "global";
}

/** 解析 scopeKind（移植自 openclaw task-registry.ts resolveTaskScopeKind）。 */
function resolveTaskScopeKind(params: {
  scopeKind?: TaskScopeKind;
  requesterSessionKey?: string;
}): TaskScopeKind {
  if (params.scopeKind === "system" || params.scopeKind === "session") {
    return params.scopeKind;
  }
  const sessionKey = normalizeOptionalString(params.requesterSessionKey);
  return sessionKey ? "session" : "system";
}

/** 从创建参数构建 TaskRecord 并持久化到 SQLite。 */
function createTaskRecordFromParams(
  params: DetachedTaskCreateParams & {
    status?: TaskStatus;
    startedAt?: number;
    lastEventAt?: number;
    progressSummary?: string | null;
  },
): TaskRecord | null {
  const now = Date.now();
  const requesterSessionKey =
    normalizeOptionalString(params.requesterSessionKey) ??
    (params.scopeKind === "system" ? "" : undefined) ??
    "";
  const scopeKind = resolveTaskScopeKind({
    scopeKind: params.scopeKind,
    requesterSessionKey,
  });
  const ownerKey = resolveTaskOwnerKey({
    requesterSessionKey,
    ownerKey: params.ownerKey,
  });
  const status: TaskStatus = params.status ?? "queued";
  const deliveryStatus: TaskDeliveryStatus =
    params.deliveryStatus ?? (scopeKind === "system" ? "not_applicable" : "pending");
  const notifyPolicy: TaskNotifyPolicy = params.notifyPolicy ?? "state_changes";
  const lastEventAt = params.lastEventAt ?? params.startedAt ?? now;
  const taskId = crypto.randomUUID();
  const record: TaskRecord = {
    taskId,
    runtime: params.runtime,
    ...(params.taskKind ? { taskKind: params.taskKind } : {}),
    ...(params.sourceId ? { sourceId: params.sourceId } : {}),
    requesterSessionKey,
    ownerKey,
    scopeKind,
    ...(params.childSessionKey ? { childSessionKey: params.childSessionKey } : {}),
    ...(params.parentFlowId ? { parentFlowId: params.parentFlowId } : {}),
    ...(params.parentTaskId ? { parentTaskId: params.parentTaskId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    ...(params.requesterAgentId ? { requesterAgentId: params.requesterAgentId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(params.label ? { label: params.label } : {}),
    task: params.task,
    status,
    deliveryStatus,
    notifyPolicy,
    createdAt: now,
    ...(params.startedAt != null ? { startedAt: params.startedAt } : {}),
    lastEventAt,
    ...(params.progressSummary ? { progressSummary: params.progressSummary } : {}),
  };
  if (isTerminalTaskStatus(record.status) && typeof record.cleanupAfter !== "number") {
    record.cleanupAfter = resolveTaskCleanupAfter(record);
  }
  try {
    upsertTaskRegistryRecordToSqlite(record);
  } catch {
    return null;
  }
  // 持久化投递状态（如果有 requesterOrigin）
  if (params.requesterOrigin) {
    try {
      upsertTaskDeliveryStateToSqlite({
        taskId,
        requesterOrigin: params.requesterOrigin,
      });
    } catch {
      // 投递状态持久化失败不阻塞任务创建
    }
  }
  return record;
}

/** 按 runId 查找并更新任务状态（移植自 openclaw task-registry.ts updateTaskStateByRunId）。 */
function updateTaskStateByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  status?: TaskStatus;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  error?: string;
  progressSummary?: string | null;
  terminalSummary?: string | null;
  terminalOutcome?: TaskTerminalOutcome | null;
}): TaskRecord[] {
  const runId = normalizeOptionalString(params.runId);
  if (!runId) {
    return [];
  }
  // 通过 SQLite 查找匹配 runId 的任务
  const { db } = openStateDatabase();
  const rows = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE run_id = ? ORDER BY created_at ASC`)
    .all(runId) as TaskRegistryRow[];
  let matches = rows.map(rowToTaskRecord);
  // 按 runtime 过滤
  if (params.runtime) {
    matches = matches.filter((task) => task.runtime === params.runtime);
  }
  // 按 sessionKey 过滤
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (sessionKey) {
    const childMatches = matches.filter(
      (task) => normalizeOptionalString(task.childSessionKey) === sessionKey,
    );
    if (childMatches.length > 0) {
      matches = childMatches;
    } else {
      const ownerMatches = matches.filter(
        (task) => task.scopeKind === "session" && normalizeOptionalString(task.ownerKey) === sessionKey,
      );
      matches = ownerMatches;
    }
  }
  if (matches.length === 0) {
    return [];
  }
  const updated: TaskRecord[] = [];
  for (const current of matches) {
    const patch: Partial<TaskRecord> = {};
    const nextStatus = params.status ?? current.status;
    // 状态转换检查：终态任务不再更新
    if (params.status && isTerminalTaskStatus(current.status) && current.status !== nextStatus) {
      continue;
    }
    if (params.status) {
      patch.status = nextStatus;
    }
    if (params.startedAt != null) {
      patch.startedAt = params.startedAt;
    }
    if (params.endedAt != null) {
      patch.endedAt = params.endedAt;
    }
    if (params.lastEventAt != null) {
      patch.lastEventAt = params.lastEventAt;
    }
    if (params.error !== undefined) {
      patch.error = params.error;
    }
    if (params.progressSummary !== undefined) {
      patch.progressSummary = normalizeTaskSummary(params.progressSummary);
    }
    if (params.terminalSummary !== undefined) {
      patch.terminalSummary = normalizeTaskSummary(params.terminalSummary);
    }
    if (params.terminalOutcome !== undefined) {
      patch.terminalOutcome = resolveTaskTerminalOutcome({
        status: nextStatus,
        terminalOutcome: params.terminalOutcome,
      });
    }
    const next = normalizeTaskTimestamps({ ...current, ...patch });
    if (isTerminalTaskStatus(next.status) && typeof next.cleanupAfter !== "number") {
      next.cleanupAfter = resolveTaskCleanupAfter(next);
    }
    try {
      upsertTaskRegistryRecordToSqlite(next);
      updated.push({ ...next });
    } catch {
      // 持久化失败跳过
    }
  }
  return updated;
}

/** 按 runId 查找并更新投递状态。 */
function updateDeliveryStatusByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  deliveryStatus: TaskDeliveryStatus;
  error?: string;
}): TaskRecord[] {
  const runId = normalizeOptionalString(params.runId);
  if (!runId) {
    return [];
  }
  const { db } = openStateDatabase();
  const rows = db
    .prepare(`SELECT ${TASK_RUN_COLUMNS} FROM task_runs WHERE run_id = ? ORDER BY created_at ASC`)
    .all(runId) as TaskRegistryRow[];
  let matches = rows.map(rowToTaskRecord);
  if (params.runtime) {
    matches = matches.filter((task) => task.runtime === params.runtime);
  }
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (sessionKey) {
    matches = matches.filter(
      (task) =>
        normalizeOptionalString(task.childSessionKey) === sessionKey ||
        (task.scopeKind === "session" && normalizeOptionalString(task.ownerKey) === sessionKey),
    );
  }
  const updated: TaskRecord[] = [];
  for (const current of matches) {
    const next: TaskRecord = {
      ...current,
      deliveryStatus: params.deliveryStatus,
      lastEventAt: Date.now(),
      ...(params.error !== undefined ? { error: params.error } : {}),
    };
    try {
      upsertTaskRegistryRecordToSqlite(next);
      updated.push({ ...next });
    } catch {
      // 持久化失败跳过
    }
  }
  return updated;
}

/** 创建排队任务运行。 */
export function createQueuedTaskRun(params: DetachedTaskCreateParams): TaskRecord | null {
  return createTaskRecordFromParams({ ...params, status: "queued" });
}

/** 创建运行中任务运行。 */
export function createRunningTaskRun(
  params: DetachedRunningTaskCreateParams,
): TaskRecord | null {
  return createTaskRecordFromParams({
    ...params,
    status: "running",
    startedAt: params.startedAt ?? Date.now(),
  });
}

/** 启动任务运行：标记为 running。 */
export function startTaskRunByRunId(params: DetachedTaskStartParams): TaskRecord[] {
  return updateTaskStateByRunId({
    runId: params.runId,
    runtime: params.runtime,
    sessionKey: params.sessionKey,
    status: "running",
    startedAt: params.startedAt,
    lastEventAt: params.lastEventAt,
    progressSummary: params.progressSummary,
  });
}

/** 记录任务进度。 */
export function recordTaskRunProgressByRunId(params: DetachedTaskProgressParams): TaskRecord[] {
  return updateTaskStateByRunId({
    runId: params.runId,
    runtime: params.runtime,
    sessionKey: params.sessionKey,
    lastEventAt: params.lastEventAt,
    progressSummary: params.progressSummary,
  });
}

/** 完成任务运行：标记为 succeeded。 */
export function completeTaskRunByRunId(params: DetachedTaskCompleteParams): TaskRecord[] {
  return finalizeTaskRunByRunId({
    ...params,
    status: "succeeded",
  });
}

/** 失败任务运行：标记为 failed/timed_out/cancelled。 */
export function failTaskRunByRunId(params: DetachedTaskFailParams): TaskRecord[] {
  return finalizeTaskRunByRunId({
    ...params,
    status: params.status ?? "failed",
  });
}

/** 终结任务运行：应用终态状态。 */
export function finalizeTaskRunByRunId(params: DetachedTaskFinalizeParams): TaskRecord[] {
  return updateTaskStateByRunId({
    runId: params.runId,
    runtime: params.runtime,
    sessionKey: params.sessionKey,
    status: params.status,
    endedAt: params.endedAt,
    lastEventAt: params.lastEventAt,
    error: params.error,
    progressSummary: params.progressSummary,
    terminalSummary: params.terminalSummary,
    terminalOutcome: params.terminalOutcome,
  });
}

/** 设置分离任务投递状态。 */
export function setDetachedTaskDeliveryStatusByRunId(
  params: DetachedTaskDeliveryStatusParams,
): TaskRecord[] {
  return updateDeliveryStatusByRunId({
    runId: params.runId,
    runtime: params.runtime,
    sessionKey: params.sessionKey,
    deliveryStatus: params.deliveryStatus,
    error: params.error,
  });
}
