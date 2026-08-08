// Reconciles stale or lost task registry records during maintenance passes.
// 移植自 openclaw/src/tasks/task-registry.maintenance.ts（降级实现）。
// 降级说明：大量依赖模块（acp、agents、cron、plugin-state 等）未移植，
// 本文件保留类型签名和核心结构，但实际运行时返回空结果或 no-op。
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  listTasksForFlowId,
  getTaskById,
  listTaskRecords,
  markTaskTerminalById,
  resolveTaskForLookupToken,
} from "./_openclaw-task-stubs.js";
import type { TaskRecord, TaskStatus } from "./task-registry.types.js";

const log = createSubsystemLogger("tasks/task-registry-maintenance");
const TASK_RECONCILE_GRACE_MS = 5 * 60_000;
const TASK_STALE_RUNNING_MS = 30 * 60_000;
const TASK_SWEEP_INTERVAL_MS = 60_000;
const SWEEP_YIELD_BATCH_SIZE = 25;

let sweeper: NodeJS.Timeout | null = null;
let deferredSweep: NodeJS.Timeout | null = null;
let sweepInProgress = false;

export type TaskRegistryMaintenanceSummary = {
  reconciled: number;
  lost: number;
  pruned: number;
  deliverySwept: number;
  pluginStateSwept: number;
};

export type TaskRegistryMaintenanceTaskDiagnostic = {
  taskId: string;
  status: TaskStatus;
  ageMs: number;
  lastEventMs: number;
  reason: string;
};

export type TaskRegistryMaintenanceDiagnostics = {
  staleRunning: TaskRegistryMaintenanceTaskDiagnostic[];
  potentiallyLost: TaskRegistryMaintenanceTaskDiagnostic[];
  readyForCleanup: TaskRegistryMaintenanceTaskDiagnostic[];
};

type TaskRegistryMaintenanceRuntime = {
  listAcpSessionEntries?: () => Array<Record<string, any>>;
  readAcpSessionEntry?: (sessionKey: string) => Record<string, any> | undefined;
  closeAcpSession?: (params: { sessionKey: string; reason: string }) => Promise<void>;
  listSessionBindingsBySession?: (sessionKey: string) => Array<Record<string, any>>;
  unbindSessionBindings?: (ids: readonly string[]) => void;
  listCronJobs?: () => Array<Record<string, any>>;
  readCronRunLog?: (jobId: string) => Array<Record<string, any>>;
  isCronJobActive?: (jobId: string) => boolean;
  isPluginStateDatabaseOpen?: () => boolean;
  sweepExpiredPluginStateEntries?: () => number;
};

let configuredRuntime: TaskRegistryMaintenanceRuntime = {};

function getTaskAgeMs(task: TaskRecord, now: number): number {
  return now - (task.lastEventAt ?? task.createdAt);
}

function isTaskStaleRunning(task: TaskRecord, now: number): boolean {
  if (task.status !== "running") return false;
  return getTaskAgeMs(task, now) >= TASK_STALE_RUNNING_MS;
}

function findStaleRunningTasks(now: number): TaskRegistryMaintenanceTaskDiagnostic[] {
  const diagnostics: TaskRegistryMaintenanceTaskDiagnostic[] = [];
  for (const task of listTaskRecords()) {
    if (isTaskStaleRunning(task, now)) {
      diagnostics.push({
        taskId: task.taskId,
        status: task.status,
        ageMs: getTaskAgeMs(task, now),
        lastEventMs: task.lastEventAt ?? task.createdAt,
        reason: "Task has been running without events beyond stale threshold",
      });
    }
  }
  return diagnostics;
}

function findPotentiallyLostTasks(now: number): TaskRegistryMaintenanceTaskDiagnostic[] {
  const diagnostics: TaskRegistryMaintenanceTaskDiagnostic[] = [];
  for (const task of listTaskRecords()) {
    if (task.status === "running" && getTaskAgeMs(task, now) >= TASK_RECONCILE_GRACE_MS * 2) {
      diagnostics.push({
        taskId: task.taskId,
        status: task.status,
        ageMs: getTaskAgeMs(task, now),
        lastEventMs: task.lastEventAt ?? task.createdAt,
        reason: "Task appears lost — no recent events and no active execution context",
      });
    }
  }
  return diagnostics;
}

function findReadyForCleanupTasks(now: number): TaskRegistryMaintenanceTaskDiagnostic[] {
  const diagnostics: TaskRegistryMaintenanceTaskDiagnostic[] = [];
  for (const task of listTaskRecords()) {
    if (
      (task.status === "succeeded" ||
        task.status === "failed" ||
        task.status === "cancelled" ||
        task.status === "timed_out" ||
        task.status === "lost") &&
      task.cleanupAfter &&
      task.cleanupAfter <= now
    ) {
      diagnostics.push({
        taskId: task.taskId,
        status: task.status,
        ageMs: now - (task.endedAt ?? task.createdAt),
        lastEventMs: task.endedAt ?? task.lastEventAt ?? task.createdAt,
        reason: "Task is terminal and past its cleanup timestamp",
      });
    }
  }
  return diagnostics;
}

export function reconcileTaskRecordForOperatorInspection(
  _taskId: string,
): TaskRecord | null {
  return null;
}

export function reconcileInspectableTasks(): TaskRecord[] {
  return [];
}

export type ActiveTaskRestartBlocker = {
  taskId: string;
  reason: string;
  detail?: string;
};

export function getInspectableActiveTaskRestartBlockers(): ActiveTaskRestartBlocker[] {
  return [];
}

export function getInspectableTaskRegistrySummary(
  _options?: { scope?: string },
): Record<string, number> {
  return {
    total: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    timed_out: 0,
    lost: 0,
  };
}

export function getInspectableTaskAuditSummary() {
  return {
    total: 0,
    warnings: 0,
    errors: 0,
    byCode: {} as Record<string, number>,
  };
}

export function getInspectableTaskAuditFindings(_options?: {
  now?: number;
  limit?: number;
}): Array<Record<string, any>> {
  return [];
}

export function reconcileTaskLookupToken(token: string): TaskRecord | undefined {
  const lookup = normalizeOptionalString(token);
  if (!lookup) return undefined;
  return getTaskById(lookup) ?? resolveTaskForLookupToken(lookup);
}

export function previewTaskRegistryMaintenance(): TaskRegistryMaintenanceSummary {
  const now = Date.now();
  let reconciled = 0;
  let lost = 0;
  let pruned = 0;

  for (const task of listTaskRecords()) {
    if (isTaskStaleRunning(task, now)) {
      reconciled += 1;
      continue;
    }
    if (
      task.status === "running" &&
      getTaskAgeMs(task, now) >= TASK_RECONCILE_GRACE_MS * 2
    ) {
      lost += 1;
      continue;
    }
    if (
      task.cleanupAfter &&
      task.cleanupAfter <= now &&
      (task.status === "succeeded" ||
        task.status === "failed" ||
        task.status === "cancelled" ||
        task.status === "timed_out" ||
        task.status === "lost")
    ) {
      pruned += 1;
    }
  }

  return {
    reconciled,
    lost,
    pruned,
    deliverySwept: 0,
    pluginStateSwept: 0,
  };
}

export function getTaskRegistryMaintenanceDiagnostics(): TaskRegistryMaintenanceDiagnostics {
  const now = Date.now();
  return {
    staleRunning: findStaleRunningTasks(now),
    potentiallyLost: findPotentiallyLostTasks(now),
    readyForCleanup: findReadyForCleanupTasks(now),
  };
}

async function runTaskRegistryMaintenanceSweep(): Promise<TaskRegistryMaintenanceSummary> {
  const now = Date.now();
  const reconciled = 0;
  let lost = 0;
  let pruned = 0;

  const tasks = listTaskRecords();
  for (let i = 0; i < tasks.length; i += SWEEP_YIELD_BATCH_SIZE) {
    const batch = tasks.slice(i, i + SWEEP_YIELD_BATCH_SIZE);
    for (const task of batch) {
      if (isTaskStaleRunning(task, now)) {
        const result = markTaskTerminalById({
          taskId: task.taskId,
          status: "lost",
          endedAt: now,
          lastEventAt: now,
          error: "Task marked lost during maintenance sweep",
        });
        if (result) lost += 1;
        continue;
      }
      if (
        task.cleanupAfter &&
        task.cleanupAfter <= now &&
        (task.status === "succeeded" ||
          task.status === "failed" ||
          task.status === "cancelled" ||
          task.status === "timed_out" ||
          task.status === "lost")
      ) {
        pruned += 1;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  let pluginStateSwept = 0;
  if (configuredRuntime.sweepExpiredPluginStateEntries) {
    try {
      pluginStateSwept = configuredRuntime.sweepExpiredPluginStateEntries();
    } catch {
      // ignore
    }
  }

  return {
    reconciled,
    lost,
    pruned,
    deliverySwept: 0,
    pluginStateSwept,
  };
}

export function startTaskRegistryMaintenance() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    if (sweepInProgress) {
      if (!deferredSweep) {
        deferredSweep = setTimeout(() => {
          deferredSweep = null;
          if (!sweepInProgress) {
            sweepInProgress = true;
            runTaskRegistryMaintenanceSweep()
              .catch((err) => log.warn("Maintenance sweep failed", { error: err }))
              .finally(() => {
                sweepInProgress = false;
              });
          }
        }, TASK_SWEEP_INTERVAL_MS);
      }
      return;
    }
    sweepInProgress = true;
    runTaskRegistryMaintenanceSweep()
      .catch((err) => log.warn("Maintenance sweep failed", { error: err }))
      .finally(() => {
        sweepInProgress = false;
      });
  }, TASK_SWEEP_INTERVAL_MS);
  log.info("Task registry maintenance started");
}

export function stopTaskRegistryMaintenance() {
  if (sweeper) {
    clearInterval(sweeper);
    sweeper = null;
  }
  if (deferredSweep) {
    clearTimeout(deferredSweep);
    deferredSweep = null;
  }
  log.info("Task registry maintenance stopped");
}

export function setTaskRegistryMaintenanceRuntimeForTests(
  runtime: TaskRegistryMaintenanceRuntime,
): void {
  configuredRuntime = runtime;
}

export function resetTaskRegistryMaintenanceRuntimeForTests(): void {
  configuredRuntime = {};
  stopTaskRegistryMaintenance();
}

export function configureTaskRegistryMaintenance(options: {
  cronStorePath?: string;
  runtimeAuthoritative?: boolean;
}): void {
  if (options.cronStorePath !== undefined) {
    // no-op: cron store not used in downgraded mode
  }
  if (options.runtimeAuthoritative !== undefined) {
    // no-op: runtime authoritative flag not used in downgraded mode
  }
}
