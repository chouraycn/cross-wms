// Persists managed task-flow records through the OpenClaw SQLite state database.
// 移植自 openclaw/src/tasks/task-flow-registry.store.sqlite.ts。
// 降级说明：使用 better-sqlite3 替代 node:sqlite，Kysely 查询使用降级实现。
import type { Database } from "better-sqlite3";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { normalizeSqliteNumber } from "../infra/sqlite-number.js";
import {
  closeStateDatabase,
  openStateDatabase,
  runStateWriteTransaction,
} from "../state/openclaw-state-db.js";
import type { TaskFlowRegistryStoreSnapshot } from "./task-flow-registry.store.types.js";
import {
  parseOptionalTaskFlowSyncMode,
  parseTaskFlowStatus,
  type JsonValue,
  type TaskFlowRecord,
  type TaskFlowSyncMode,
} from "./task-flow-registry.types.js";
import { parseDeliveryContextJson } from "./task-registry.sqlite.shared.js";
import { parseTaskNotifyPolicy } from "./task-registry.types.js";

type FlowRegistryRow = {
  flow_id: string;
  sync_mode: string | null;
  shape: string | null;
  owner_key: string;
  requester_origin_json: string | null;
  controller_id: string | null;
  revision: number | bigint | null;
  status: string;
  notify_policy: string;
  goal: string;
  current_step: string | null;
  blocked_task_id: string | null;
  blocked_summary: string | null;
  state_json: string | null;
  wait_json: string | null;
  cancel_requested_at: number | bigint | null;
  created_at: number | bigint | null;
  updated_at: number | bigint | null;
  ended_at: number | bigint | null;
};

type FlowRegistryDatabase = {
  db: Database;
  path: string;
};

let cachedDatabase: FlowRegistryDatabase | null = null;

function serializeJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJsonValue(raw: string | null): JsonValue | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return undefined;
  }
}

function rowToSyncMode(row: FlowRegistryRow): TaskFlowSyncMode {
  const syncMode = parseOptionalTaskFlowSyncMode(row.sync_mode);
  if (syncMode) {
    return syncMode;
  }
  return row.shape === "single_task" ? "task_mirrored" : "managed";
}

function rowToFlowRecord(row: FlowRegistryRow): TaskFlowRecord {
  const endedAt = normalizeSqliteNumber(row.ended_at);
  const cancelRequestedAt = normalizeSqliteNumber(row.cancel_requested_at);
  const requesterOrigin = parseDeliveryContextJson(row.requester_origin_json);
  const stateJson = parseJsonValue(row.state_json);
  const waitJson = parseJsonValue(row.wait_json);
  return {
    flowId: row.flow_id,
    syncMode: rowToSyncMode(row),
    ownerKey: row.owner_key,
    ...(requesterOrigin ? { requesterOrigin } : {}),
    ...(row.controller_id ? { controllerId: row.controller_id } : {}),
    revision: normalizeSqliteNumber(row.revision) ?? 0,
    status: parseTaskFlowStatus(row.status),
    notifyPolicy: parseTaskNotifyPolicy(row.notify_policy),
    goal: row.goal,
    ...(row.current_step ? { currentStep: row.current_step } : {}),
    ...(row.blocked_task_id ? { blockedTaskId: row.blocked_task_id } : {}),
    ...(row.blocked_summary ? { blockedSummary: row.blocked_summary } : {}),
    ...(stateJson !== undefined ? { stateJson } : {}),
    ...(waitJson !== undefined ? { waitJson } : {}),
    ...(cancelRequestedAt != null ? { cancelRequestedAt } : {}),
    createdAt: normalizeSqliteNumber(row.created_at) ?? 0,
    updatedAt: normalizeSqliteNumber(row.updated_at) ?? 0,
    ...(endedAt != null ? { endedAt } : {}),
  };
}

function bindFlowRecord(record: TaskFlowRecord): Record<string, unknown> {
  return {
    flow_id: record.flowId,
    sync_mode: record.syncMode,
    shape: null,
    owner_key: record.ownerKey,
    requester_origin_json: serializeJson(record.requesterOrigin),
    controller_id: record.controllerId ?? null,
    revision: record.revision,
    status: record.status,
    notify_policy: record.notifyPolicy,
    goal: record.goal,
    current_step: record.currentStep ?? null,
    blocked_task_id: record.blockedTaskId ?? null,
    blocked_summary: record.blockedSummary ?? null,
    state_json: serializeJson(record.stateJson),
    wait_json: serializeJson(record.waitJson),
    cancel_requested_at: record.cancelRequestedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    ended_at: record.endedAt ?? null,
  };
}

function getFlowRegistryKysely(db: Database) {
  return getNodeSqliteKysely(db);
}

function selectFlowRows(db: Database): FlowRegistryRow[] {
  const query = getFlowRegistryKysely(db)
    .selectFrom("flow_runs")
    .select([
      "flow_id",
      "sync_mode",
      "shape",
      "owner_key",
      "requester_origin_json",
      "controller_id",
      "revision",
      "status",
      "notify_policy",
      "goal",
      "current_step",
      "blocked_task_id",
      "blocked_summary",
      "state_json",
      "wait_json",
      "cancel_requested_at",
      "created_at",
      "updated_at",
      "ended_at",
    ])
    .orderBy("created_at", "asc")
    .orderBy("flow_id", "asc");
  return executeSqliteQuerySync(db, query).rows as FlowRegistryRow[];
}

function upsertFlowRow(db: Database, row: Record<string, unknown>): void {
  executeSqliteQuerySync(
    db,
    getFlowRegistryKysely(db)
      .insertInto("flow_runs")
      .values(row)
      .onConflict((conflict: unknown) =>
        conflict.column("flow_id").doUpdateSet({
          sync_mode: (eb: unknown) => eb.ref("excluded.sync_mode"),
          owner_key: (eb: unknown) => eb.ref("excluded.owner_key"),
          requester_origin_json: (eb: unknown) => eb.ref("excluded.requester_origin_json"),
          controller_id: (eb: unknown) => eb.ref("excluded.controller_id"),
          revision: (eb: unknown) => eb.ref("excluded.revision"),
          status: (eb: unknown) => eb.ref("excluded.status"),
          notify_policy: (eb: unknown) => eb.ref("excluded.notify_policy"),
          goal: (eb: unknown) => eb.ref("excluded.goal"),
          current_step: (eb: unknown) => eb.ref("excluded.current_step"),
          blocked_task_id: (eb: unknown) => eb.ref("excluded.blocked_task_id"),
          blocked_summary: (eb: unknown) => eb.ref("excluded.blocked_summary"),
          state_json: (eb: unknown) => eb.ref("excluded.state_json"),
          wait_json: (eb: unknown) => eb.ref("excluded.wait_json"),
          cancel_requested_at: (eb: unknown) => eb.ref("excluded.cancel_requested_at"),
          created_at: (eb: unknown) => eb.ref("excluded.created_at"),
          updated_at: (eb: unknown) => eb.ref("excluded.updated_at"),
          ended_at: (eb: unknown) => eb.ref("excluded.ended_at"),
        }),
      ),
  );
}

function openFlowRegistryDatabase(): FlowRegistryDatabase {
  const database: unknown = openStateDatabase();
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

function withWriteTransaction(write: (database: FlowRegistryDatabase) => void) {
  const database = openFlowRegistryDatabase();
  runStateWriteTransaction(() => {
    write(database);
  });
}

export function loadTaskFlowRegistryStateFromSqlite(): TaskFlowRegistryStoreSnapshot {
  const { db } = openFlowRegistryDatabase();
  const rows = selectFlowRows(db);
  return {
    flows: new Map(rows.map((row) => [row.flow_id, rowToFlowRecord(row)])),
  };
}

export function saveTaskFlowRegistryStateToSqlite(snapshot: TaskFlowRegistryStoreSnapshot) {
  withWriteTransaction(({ db }) => {
    const kysely = getFlowRegistryKysely(db);
    const flowIds = [...snapshot.flows.keys()];
    if (flowIds.length === 0) {
      executeSqliteQuerySync(db, kysely.deleteFrom("flow_runs"));
      return;
    }
    for (const flow of snapshot.flows.values()) {
      upsertFlowRow(db, bindFlowRecord(flow));
    }
  });
}

export function upsertTaskFlowRegistryRecordToSqlite(flow: TaskFlowRecord) {
  withWriteTransaction(({ db }) => {
    upsertFlowRow(db, bindFlowRecord(flow));
  });
}

export function deleteTaskFlowRegistryRecordFromSqlite(flowId: string) {
  withWriteTransaction(({ db }) => {
    executeSqliteQuerySync(
      db,
      getFlowRegistryKysely(db).deleteFrom("flow_runs").where("flow_id", "=", flowId),
    );
  });
}

export function closeTaskFlowRegistryDatabase() {
  cachedDatabase = null;
  closeStateDatabase();
}
