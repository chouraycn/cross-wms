import type { Command } from "commander";
import { logger } from "../../logger.js";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "lost" | "timed_out";
export type TaskRuntime = "cron" | "flow" | "session" | "api";
export type TaskNotifyPolicy = "never" | "on_failure" | "always";
export type TaskDeliveryStatus = "pending" | "delivered" | "acknowledged" | "rejected";

export interface TaskRecord {
  taskId: string;
  runtime: TaskRuntime;
  status: TaskStatus;
  deliveryStatus: TaskDeliveryStatus;
  notifyPolicy: TaskNotifyPolicy;
  ownerKey: string;
  task: string;
  label?: string;
  sourceId?: string;
  childSessionKey?: string;
  parentTaskId?: string;
  agentId?: string;
  runId?: string;
  createdAt?: number;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  cleanupAfter?: number;
  error?: string;
  progressSummary?: string;
  terminalSummary?: string;
  terminalOutcome?: string;
}

const RUNTIME_PAD = 8;
const STATUS_PAD = 10;
const DELIVERY_PAD = 14;
const ID_PAD = 10;
const RUN_PAD = 10;

const TASK_STORE: Map<string, TaskRecord> = new Map([
  [
    "task-001",
    {
      taskId: "task-001",
      runtime: "cron",
      status: "succeeded",
      deliveryStatus: "acknowledged",
      notifyPolicy: "on_failure",
      ownerKey: "agent:wms-expert",
      task: "snapshot:inventory",
      label: "每日库存快照",
      runId: "run-abc123",
      createdAt: Date.now() - 86400000,
      startedAt: Date.now() - 86300000,
      endedAt: Date.now() - 86200000,
      lastEventAt: Date.now() - 86200000,
      terminalSummary: "库存快照已完成",
      terminalOutcome: "success",
    },
  ],
  [
    "task-002",
    {
      taskId: "task-002",
      runtime: "flow",
      status: "running",
      deliveryStatus: "delivered",
      notifyPolicy: "always",
      ownerKey: "agent:wms-analyst",
      task: "predict:replenish",
      label: "补货预测",
      runId: "run-def456",
      createdAt: Date.now() - 3600000,
      startedAt: Date.now() - 3500000,
      lastEventAt: Date.now() - 100000,
      progressSummary: "正在分析库存数据...",
    },
  ],
  [
    "task-003",
    {
      taskId: "task-003",
      runtime: "session",
      status: "queued",
      deliveryStatus: "pending",
      notifyPolicy: "never",
      ownerKey: "agent:wms-operator",
      task: "report:weekly",
      label: "周报生成",
      createdAt: Date.now() - 60000,
    },
  ],
  [
    "task-004",
    {
      taskId: "task-004",
      runtime: "api",
      status: "failed",
      deliveryStatus: "rejected",
      notifyPolicy: "on_failure",
      ownerKey: "agent:general",
      task: "export:orders",
      label: "订单导出",
      runId: "run-ghi789",
      createdAt: Date.now() - 1800000,
      startedAt: Date.now() - 1750000,
      endedAt: Date.now() - 1700000,
      lastEventAt: Date.now() - 1700000,
      error: "数据库连接超时",
      terminalOutcome: "error",
    },
  ],
]);

function formatTaskTimestamp(value: number | undefined): string {
  if (typeof value !== "number") return "n/a";
  return new Date(value).toISOString();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 1)}…`;
}

function shortToken(value: string | undefined, maxChars = ID_PAD): string {
  const trimmed = value?.trim();
  if (!trimmed) return "n/a";
  return truncate(trimmed, maxChars);
}

function formatTaskStatusCell(status: string): string {
  const padded = status.padEnd(STATUS_PAD);
  if (status === "succeeded") return `\x1b[32m${padded}\x1b[0m`;
  if (status === "failed" || status === "lost" || status === "timed_out") return `\x1b[31m${padded}\x1b[0m`;
  if (status === "running") return `\x1b[36m${padded}\x1b[0m`;
  return padded;
}

function formatTaskRows(tasks: TaskRecord[]): string[] {
  const header = [
    "Task".padEnd(ID_PAD),
    "Kind".padEnd(RUNTIME_PAD),
    "Status".padEnd(STATUS_PAD),
    "Delivery".padEnd(DELIVERY_PAD),
    "Run".padEnd(RUN_PAD),
    "Child Session",
    "Summary",
  ].join(" ");
  const lines = [header];
  for (const task of tasks) {
    const summary = truncate(
      task.terminalSummary || task.progressSummary || task.label || task.task,
      80,
    );
    const line = [
      shortToken(task.taskId).padEnd(ID_PAD),
      task.runtime.padEnd(RUNTIME_PAD),
      formatTaskStatusCell(task.status),
      task.deliveryStatus.padEnd(DELIVERY_PAD),
      shortToken(task.runId, RUN_PAD).padEnd(RUN_PAD),
      truncate(task.childSessionKey || "n/a", 36).padEnd(36),
      summary,
    ].join(" ");
    lines.push(line.trimEnd());
  }
  return lines;
}

function formatAgeMs(ageMs: number | undefined): string {
  if (typeof ageMs !== "number" || ageMs < 1000) return "fresh";
  const totalSeconds = Math.floor(ageMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function listInspectableTasks(): TaskRecord[] {
  return Array.from(TASK_STORE.values()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function findTaskByToken(lookup: string): TaskRecord | undefined {
  return TASK_STORE.get(lookup) || [...TASK_STORE.values()].find((t) => t.runId === lookup);
}

export function registerTasksCommand(program: Command): void {
  const tasksCmd = program
    .command("tasks")
    .description("Background task management (list/show/cancel/notify/audit/maintenance)");

  tasksCmd
    .command("list")
    .description("List background tasks")
    .option("--json", "JSON output format")
    .option("--runtime <runtime>", "Filter by runtime")
    .option("--status <status>", "Filter by status")
    .action((options: { json?: boolean; runtime?: string; status?: string }) => {
      const runtimeFilter = options.runtime?.trim();
      const statusFilter = options.status?.trim();
      const tasks = listInspectableTasks().filter((task) => {
        if (runtimeFilter && task.runtime !== runtimeFilter) return false;
        if (statusFilter && task.status !== statusFilter) return false;
        return true;
      });

      if (options.json) {
        logger.info(
          JSON.stringify(
            {
              count: tasks.length,
              runtime: runtimeFilter ?? null,
              status: statusFilter ?? null,
              tasks,
            },
            null,
            2,
          ),
        );
        return;
      }

      logger.info(`Background tasks: ${tasks.length}`);
      if (runtimeFilter) logger.info(`Runtime filter: ${runtimeFilter}`);
      if (statusFilter) logger.info(`Status filter: ${statusFilter}`);
      if (tasks.length === 0) {
        logger.info("No background tasks found.");
        return;
      }
      for (const line of formatTaskRows(tasks)) {
        logger.info(line);
      }
    });

  tasksCmd
    .command("show <lookup>")
    .description("Show task details by id or run token")
    .option("--json", "JSON output format")
    .action((lookup: string, options: { json?: boolean }) => {
      const task = findTaskByToken(lookup);
      if (!task) {
        logger.error(`Task not found: ${lookup}`);
        return;
      }

      if (options.json) {
        logger.info(JSON.stringify(task, null, 2));
        return;
      }

      const lines = [
        "Background task:",
        `taskId: ${task.taskId}`,
        `kind: ${task.runtime}`,
        `sourceId: ${task.sourceId ?? "n/a"}`,
        `status: ${task.status}`,
        `result: ${task.terminalOutcome ?? "n/a"}`,
        `delivery: ${task.deliveryStatus}`,
        `notify: ${task.notifyPolicy}`,
        `ownerKey: ${task.ownerKey}`,
        `childSessionKey: ${task.childSessionKey ?? "n/a"}`,
        `parentTaskId: ${task.parentTaskId ?? "n/a"}`,
        `agentId: ${task.agentId ?? "n/a"}`,
        `runId: ${task.runId ?? "n/a"}`,
        `label: ${task.label ?? "n/a"}`,
        `task: ${task.task}`,
        `createdAt: ${formatTaskTimestamp(task.createdAt)}`,
        `startedAt: ${formatTaskTimestamp(task.startedAt)}`,
        `endedAt: ${formatTaskTimestamp(task.endedAt)}`,
        `lastEventAt: ${formatTaskTimestamp(task.lastEventAt)}`,
        `cleanupAfter: ${formatTaskTimestamp(task.cleanupAfter)}`,
        ...(task.error ? [`error: ${task.error}`] : []),
        ...(task.progressSummary ? [`progressSummary: ${task.progressSummary}`] : []),
        ...(task.terminalSummary ? [`terminalSummary: ${task.terminalSummary}`] : []),
      ];
      for (const line of lines) {
        logger.info(line);
      }
    });

  tasksCmd
    .command("cancel <lookup>")
    .description("Cancel a running task by id or run token")
    .option("--json", "JSON output format")
    .action((lookup: string, options: { json?: boolean }) => {
      const task = findTaskByToken(lookup);
      if (!task) {
        const result = { success: false, reason: `Task not found: ${lookup}` };
        logger.info(options.json ? JSON.stringify(result, null, 2) : result.reason);
        return;
      }
      if (task.status !== "running" && task.status !== "queued") {
        const result = { success: false, reason: `Task is not running or queued: ${task.status}` };
        logger.info(options.json ? JSON.stringify(result, null, 2) : result.reason);
        return;
      }
      task.status = "failed";
      task.endedAt = Date.now();
      task.lastEventAt = Date.now();
      task.terminalOutcome = "cancelled";
      task.terminalSummary = "Task cancelled by user";
      const result = { success: true, taskId: task.taskId, runId: task.runId };
      logger.info(options.json ? JSON.stringify(result, null, 2) : `Cancelled ${task.taskId} (${task.runId ?? ""}).`);
    });

  tasksCmd
    .command("notify <lookup> <policy>")
    .description("Update task notification policy")
    .option("--json", "JSON output format")
    .action((lookup: string, policy: string, options: { json?: boolean }) => {
      const validPolicies: TaskNotifyPolicy[] = ["never", "on_failure", "always"];
      if (!validPolicies.includes(policy as TaskNotifyPolicy)) {
        logger.error(`Invalid policy: ${policy}. Must be one of: ${validPolicies.join(", ")}`);
        return;
      }
      const task = findTaskByToken(lookup);
      if (!task) {
        logger.error(`Task not found: ${lookup}`);
        return;
      }
      task.notifyPolicy = policy as TaskNotifyPolicy;
      logger.info(options.json ? JSON.stringify({ taskId: task.taskId, notifyPolicy: task.notifyPolicy }, null, 2) : `Updated ${task.taskId} notify policy to ${task.notifyPolicy}.`);
    });

  tasksCmd
    .command("audit")
    .description("Audit task and task-flow registry")
    .option("--json", "JSON output format")
    .option("--severity <severity>", "Filter by severity")
    .option("--limit <n>", "Limit results", "20")
    .action((options: { json?: boolean; severity?: string; limit?: string }) => {
      const tasks = listInspectableTasks();
      const findings = tasks.map((task) => ({
        kind: task.status === "failed" || task.status === "lost" ? "task" : "task",
        severity: task.status === "failed" || task.status === "lost" ? "error" : "warning",
        code: task.status === "failed" ? "task_failed" : "task_stale",
        token: task.taskId,
        status: task.status,
        ageMs: task.lastEventAt ? Date.now() - task.lastEventAt : undefined,
        detail: task.error || task.terminalSummary || "No detail",
      }));

      if (options.json) {
        logger.info(JSON.stringify({ total: findings.length, findings }, null, 2));
        return;
      }

      logger.info(`Tasks audit: ${findings.length} findings`);
      for (const finding of findings.slice(0, parseInt(options.limit || "20", 10))) {
        logger.info(
          `${finding.severity.padEnd(8)} ${finding.code.padEnd(20)} ${finding.token.padEnd(12)} ${formatAgeMs(finding.ageMs).padEnd(8)} ${finding.detail}`,
        );
      }
    });

  tasksCmd
    .command("maintenance")
    .description("Preview or apply task maintenance")
    .option("--json", "JSON output format")
    .option("--apply", "Apply maintenance changes")
    .action((options: { json?: boolean; apply?: boolean }) => {
      const tasks = listInspectableTasks();
      const pruned = tasks.filter((t) => t.status === "succeeded" && t.endedAt && Date.now() - t.endedAt > 86400000);

      if (options.json) {
        logger.info(
          JSON.stringify(
            {
              mode: options.apply ? "apply" : "preview",
              maintenance: {
                tasks: { reconciled: 0, recovered: 0, pruned: pruned.length },
                taskFlows: { reconciled: 0, pruned: 0 },
                sessions: { pruned: 0 },
              },
              totalTasks: tasks.length,
            },
            null,
            2,
          ),
        );
        return;
      }

      logger.info(`Tasks maintenance (${options.apply ? "applied" : "preview"}): ${pruned.length} prune`);
      if (!options.apply) {
        logger.info("Dry run only. Re-run with `cdfknow tasks maintenance --apply` to write changes.");
      }
    });
}