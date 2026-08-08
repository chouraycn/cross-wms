// Persists task registry records and events through the OpenClaw SQLite state database.
// 移植自 openclaw/src/tasks/task-registry.store.sqlite.ts。
// 降级说明：使用 better-sqlite3 替代 node:sqlite，Kysely 查询使用降级实现。
import type { Database } from "better-sqlite3";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { normalizeSqliteNumber } from "../infra/sqlite-number.js";
import {
  closeStateDatabase,
  openStateDatabase,
  runStateWriteTransaction,
} from "../state/openclaw-state-db.js";
import { parseDeliveryContextJson } from "./task-registry.sqlite.shared.js";
import type { TaskRegistryStoreSnapshot } from "./task-registry.store.types.js";
import {
  parseOptionalTaskTerminalOutcome,
  parseTaskDeliveryStatus,
  parseTaskNotifyPolicy,
  parseTaskRuntime,
  parseTaskScopeKind,
  parseTaskStatus,
  type TaskDeliveryState,
  type TaskRecord,
} from "./task-registry.types.js";

type TaskRegistryRow = {
  task_id: string;
  runtime: string;
  task_kind: string | null;
  source_id: string | null;
  requester_session_key: string;
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

type TaskRegistryDatabase = {
  db: Database;
  path: string;
};

const TASK_RUN_SELECT_COLUMNS = [
  "task_id",
  "runtime",
  "task_kind",
  "source_id",
  "requester_session_key",
  "owner_key",
  "scope_kind",
  "child_session_key",
  "parent_flow_id",
  "parent_task_id",
  "agent_id",
  "requester_agent_id",
  "run_id",
  "label",
  "task",
  "status",
  "delivery_status",
  "notify_policy",
  "created_at",
  "started_at",
  "ended_at",
  "last_event_at",
  "cleanup_after",
  "error",
  "progress_summary",
  "terminal_summary",
  "terminal_outcome",
] as const;

let cachedDatabase: TaskRegistryDatabase | null = null;

function serializeJson(value: any): string | null {
  return value == null ? null : JSON.stringify(value);
}

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

function bindTaskRecordBase(record: TaskRecord): Record<string, any> {
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

function bindTaskDeliveryState(state: TaskDeliveryState): Record<string, any> {
  return {
    task_id: state.taskId,
    requester_origin_json: serializeJson(state.requesterOrigin),
    last_notified_event_at: state.lastNotifiedEventAt ?? null,
  };
}

function getTaskRegistryKysely(db: Database) {
  return getNodeSqliteKysely(db);
}

function selectTaskRows(db: Database): TaskRegistryRow[] {
  const query = getTaskRegistryKysely(db)
    .selectFrom("task_runs")
    .select(TASK_RUN_SELECT_COLUMNS as any)
    .orderBy("created_at", "asc")
    .orderBy("task_id", "asc");
  return executeSqliteQuerySync(db, query).rows as TaskRegistryRow[];
}

function selectTaskDeliveryStateRows(db: Database): TaskDeliveryStateRow[] {
  const query = getTaskRegistryKysely(db)
    .selectFrom("task_delivery_state")
    .select(["task_id", "requester_origin_json", "last_notified_event_at"] as any)
    .orderBy("task_id", "asc");
  return executeSqliteQuerySync(db, query).rows as TaskDeliveryStateRow[];
}

function upsertTaskRow(db: Database, row: Record<string, any>): void {
  executeSqliteQuerySync(
    db,
    getTaskRegistryKysely(db)
      .insertInto("task_runs")
      .values(row)
      .onConflict((conflict: any) =>
        conflict.column("task_id").doUpdateSet({
          runtime: (eb: any) => eb.ref("excluded.runtime"),
          task_kind: (eb: any) => eb.ref("excluded.task_kind"),
          source_id: (eb: any) => eb.ref("excluded.source_id"),
          requester_session_key: (eb: any) => eb.ref("excluded.requester_session_key"),
          owner_key: (eb: any) => eb.ref("excluded.owner_key"),
          scope_kind: (eb: any) => eb.ref("excluded.scope_kind"),
          child_session_key: (eb: any) => eb.ref("excluded.child_session_key"),
          parent_flow_id: (eb: any) => eb.ref("excluded.parent_flow_id"),
          parent_task_id: (eb: any) => eb.ref("excluded.parent_task_id"),
          agent_id: (eb: any) => eb.ref("excluded.agent_id"),
          requester_agent_id: (eb: any) => eb.ref("excluded.requester_agent_id"),
          run_id: (eb: any) => eb.ref("excluded.run_id"),
          label: (eb: any) => eb.ref("excluded.label"),
          task: (eb: any) => eb.ref("excluded.task"),
          status: (eb: any) => eb.ref("excluded.status"),
          delivery_status: (eb: any) => eb.ref("excluded.delivery_status"),
          notify_policy: (eb: any) => eb.ref("excluded.notify_policy"),
          created_at: (eb: any) => eb.ref("excluded.created_at"),
          started_at: (eb: any) => eb.ref("excluded.started_at"),
          ended_at: (eb: any) => eb.ref("excluded.ended_at"),
          last_event_at: (eb: any) => eb.ref("excluded.last_event_at"),
          cleanup_after: (eb: any) => eb.ref("excluded.cleanup_after"),
          error: (eb: any) => eb.ref("excluded.error"),
          progress_summary: (eb: any) => eb.ref("excluded.progress_summary"),
          terminal_summary: (eb: any) => eb.ref("excluded.terminal_summary"),
          terminal_outcome: (eb: any) => eb.ref("excluded.terminal_outcome"),
        }),
      ),
  );
}

function replaceTaskDeliveryStateRow(
  db: Database,
  row: Record<string, any>,
): void {
  executeSqliteQuerySync(
    db,
    getTaskRegistryKysely(db)
      .insertInto("task_delivery_state")
      .values(row)
      .onConflict((conflict: any) =>
        conflict.column("task_id").doUpdateSet({
          requester_origin_json: (eb: any) => eb.ref("excluded.requester_origin_json"),
          last_notified_event_at: (eb: any) => eb.ref("excluded.last_notified_event_at"),
        }),
      ),
  );
}

function deleteTaskRowsWithDeliveryState(db: Database, taskId: string): void {
  const kysely = getTaskRegistryKysely(db);
  executeSqliteQuerySync(
    db,
    kysely.deleteFrom("task_delivery_state").where("task_id", "=", taskId),
  );
  executeSqliteQuerySync(db, kysely.deleteFrom("task_runs").where("task_id", "=", taskId));
}

function openTaskRegistryDatabase(): TaskRegistryDatabase {
  const database: any = openStateDatabase();
  const pathname = database.path;
  if (cachedDatabase && cachedDatabase.path === pathname && cachedDatabase.db.open) {
    return cachedDatabase;
  }
  if (cachedDatabase && !cachedDatabase.db.open) {
    cachedDatabase = null;
  }
  cachedDatabase = {
    db: database.db,
    path: pathname,
  };
  return cachedDatabase;
}

function withWriteTransaction(write: (database: TaskRegistryDatabase) => void) {
  const database = openTaskRegistryDatabase();
  runStateWriteTransaction(() => {
    write(database);
  });
}

export function loadTaskRegistryStateFromSqlite(): TaskRegistryStoreSnapshot {
  const { db } = openTaskRegistryDatabase();
  const taskRows = selectTaskRows(db);
  const deliveryRows = selectTaskDeliveryStateRows(db);
  return {
    tasks: new Map(taskRows.map((row) => [row.task_id, rowToTaskRecord(row)])),
    deliveryStates: new Map(deliveryRows.map((row) => [row.task_id, rowToTaskDeliveryState(row)])),
  };
}

export function listTaskRegistryRecordsByOwnerKeyFromSqlite(ownerKey: string): TaskRecord[] {
  const key = ownerKey.trim();
  if (!key) {
    return [];
  }
  const { db } = openTaskRegistryDatabase();
  const query = getTaskRegistryKysely(db)
    .selectFrom("task_runs")
    .select(TASK_RUN_SELECT_COLUMNS as any)
    .where("owner_key", "=", key)
    .orderBy("created_at", "asc")
    .orderBy("task_id", "asc");
  const rows = executeSqliteQuerySync(db, query).rows as TaskRegistryRow[];
  return rows.map(rowToTaskRecord);
}

export function saveTaskRegistryStateToSqlite(snapshot: TaskRegistryStoreSnapshot) {
  withWriteTransaction(({ db }) => {
    const kysely = getTaskRegistryKysely(db);
    const taskIds = [...snapshot.tasks.keys()];
    if (taskIds.length === 0) {
      executeSqliteQuerySync(db, kysely.deleteFrom("task_delivery_state"));
      executeSqliteQuerySync(db, kysely.deleteFrom("task_runs"));
      return;
    }
    for (const task of snapshot.tasks.values()) {
      upsertTaskRow(db, bindTaskRecordBase(task));
    }
    for (const state of snapshot.deliveryStates.values()) {
      replaceTaskDeliveryStateRow(db, bindTaskDeliveryState(state));
    }
  });
}

export function upsertTaskRegistryRecordToSqlite(task: TaskRecord) {
  withWriteTransaction(({ db }) => {
    upsertTaskRow(db, bindTaskRecordBase(task));
  });
}

export function upsertTaskWithDeliveryStateToSqlite(params: {
  task: TaskRecord;
  deliveryState?: TaskDeliveryState;
}) {
  withWriteTransaction(({ db }) => {
    upsertTaskRow(db, bindTaskRecordBase(params.task));
    if (params.deliveryState) {
      replaceTaskDeliveryStateRow(db, bindTaskDeliveryState(params.deliveryState));
    } else {
      executeSqliteQuerySync(
        db,
        getTaskRegistryKysely(db)
          .deleteFrom("task_delivery_state")
          .where("task_id", "=", params.task.taskId),
      );
    }
  });
}

export function deleteTaskRegistryRecordFromSqlite(taskId: string) {
  withWriteTransaction(({ db }) => {
    deleteTaskRowsWithDeliveryState(db, taskId);
  });
}

export function deleteTaskAndDeliveryStateFromSqlite(taskId: string) {
  withWriteTransaction(({ db }) => {
    deleteTaskRowsWithDeliveryState(db, taskId);
  });
}

export function upsertTaskDeliveryStateToSqlite(state: TaskDeliveryState) {
  withWriteTransaction(({ db }) => {
    replaceTaskDeliveryStateRow(db, bindTaskDeliveryState(state));
  });
}

export function deleteTaskDeliveryStateFromSqlite(taskId: string) {
  withWriteTransaction(({ db }) => {
    executeSqliteQuerySync(
      db,
      getTaskRegistryKysely(db).deleteFrom("task_delivery_state").where("task_id", "=", taskId),
    );
  });
}

export function closeTaskRegistryDatabase() {
  cachedDatabase = null;
  closeStateDatabase();
}
