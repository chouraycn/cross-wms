/**
 * 本地 stub 实现 — 为移植自 openclaw 的 tasks/ 模块提供未移植模块的占位实现。
 *
 * 设计原则：
 *  - 读操作返回空集合/undefined，保证调用方安全降级
 *  - 写操作静默 no-op，避免阻塞调用方流程
 *  - 所有 stub 加注释说明降级原因
 *
 * 参考 openclaw/src/tasks/{task-registry,task-registry.store.sqlite,
 * runtime-internal,task-flow-registry,task-flow-registry.audit,task-executor}.ts
 */
import type { TaskRegistryStoreSnapshot } from "./task-registry.store.types.js";
import type {
  TaskDeliveryState,
  TaskNotifyPolicy,
  TaskRecord,
  TaskStatus,
  TaskTerminalOutcome,
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
// task-registry.store.sqlite.ts — SQLite 持久化 stub（未移植）
// ============================================================================

/** SQLite 快照加载 stub：返回空快照。 */
export function loadTaskRegistryStateFromSqlite(): TaskRegistryStoreSnapshot {
  return { tasks: new Map(), deliveryStates: new Map() };
}

/** SQLite 快照保存 stub：no-op。 */
export function saveTaskRegistryStateToSqlite(_snapshot: TaskRegistryStoreSnapshot): void {
  // no-op: SQLite 持久化未移植
}

/** SQLite 按 ownerKey 列出任务 stub：返回空数组。 */
export function listTaskRegistryRecordsByOwnerKeyFromSqlite(_ownerKey: string): TaskRecord[] {
  return [];
}

/** SQLite upsert 任务 stub：no-op。 */
export function upsertTaskRegistryRecordToSqlite(_task: TaskRecord): void {
  // no-op
}

/** SQLite upsert 任务+投递状态 stub：no-op。 */
export function upsertTaskWithDeliveryStateToSqlite(_params: {
  task: TaskRecord;
  deliveryState?: TaskDeliveryState;
}): void {
  // no-op
}

/** SQLite 删除任务 stub：no-op。 */
export function deleteTaskRegistryRecordFromSqlite(_taskId: string): void {
  // no-op
}

/** SQLite 删除任务+投递状态 stub：no-op。 */
export function deleteTaskAndDeliveryStateFromSqlite(_taskId: string): void {
  // no-op
}

/** SQLite upsert 投递状态 stub：no-op。 */
export function upsertTaskDeliveryStateToSqlite(_state: TaskDeliveryState): void {
  // no-op
}

/** SQLite 删除投递状态 stub：no-op。 */
export function deleteTaskDeliveryStateFromSqlite(_taskId: string): void {
  // no-op
}

/** 关闭 SQLite 数据库 stub：no-op。 */
export function closeTaskRegistryDatabase(): void {
  // no-op
}

// ============================================================================
// task-registry.ts — 任务注册表查询 stub（未移植，2409行）
// ============================================================================

/** 按 taskId 获取任务 stub：返回 undefined。 */
export function getTaskById(_taskId: string): TaskRecord | undefined {
  return undefined;
}

/** 按 runId 获取任务 stub：返回 undefined。 */
export function findTaskByRunId(_runId: string): TaskRecord | undefined {
  return undefined;
}

/** 按关联 sessionKey 列出任务 stub：返回空数组。 */
export function listTasksForRelatedSessionKey(_sessionKey: string): TaskRecord[] {
  return [];
}

/** 按流程 ID 列出任务 stub：返回空数组。 */
export function listTasksForFlowId(_flowId: string): TaskRecord[] {
  return [];
}

/** 标记任务终态 stub：返回 null（未找到）。 */
export function markTaskTerminalById(_params: {
  taskId: string;
  status: Extract<TaskStatus, "succeeded" | "failed" | "timed_out" | "cancelled">;
  endedAt: number;
  lastEventAt?: number;
  error?: string;
  terminalSummary?: string | null;
  terminalOutcome?: TaskTerminalOutcome | null;
}): TaskRecord | null {
  return null;
}

/** 解析查找令牌对应任务 stub：返回 undefined。 */
export function resolveTaskForLookupToken(_token: string): TaskRecord | undefined {
  return undefined;
}

/** 更新任务通知策略 stub：返回 null。 */
export function updateTaskNotifyPolicyById(_params: {
  taskId: string;
  notifyPolicy: TaskNotifyPolicy;
}): TaskRecord | null {
  return null;
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
