import type { CronJob } from "../types.js";

interface TaskLedgerEntry {
  jobId: string;
  jobName: string;
  scheduledAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  status: "pending" | "running" | "completed";
  runId?: string;
}

const taskLedger = new Map<string, TaskLedgerEntry>();

export function recordTaskScheduled(job: CronJob, scheduledAtMs: number): void {
  taskLedger.set(job.id, {
    jobId: job.id,
    jobName: job.name,
    scheduledAtMs,
    status: "pending",
  });
}

export function recordTaskStarted(job: CronJob, runId: string): void {
  const entry = taskLedger.get(job.id);
  if (entry) {
    entry.startedAtMs = Date.now();
    entry.status = "running";
    entry.runId = runId;
  }
}

export function recordTaskCompleted(job: CronJob): void {
  const entry = taskLedger.get(job.id);
  if (entry) {
    entry.completedAtMs = Date.now();
    entry.status = "completed";
  }
}

export function getTaskLedgerEntry(jobId: string): TaskLedgerEntry | undefined {
  return taskLedger.get(jobId);
}

export function listPendingTasks(): TaskLedgerEntry[] {
  return Array.from(taskLedger.values()).filter((e) => e.status === "pending");
}

export function listRunningTasks(): TaskLedgerEntry[] {
  return Array.from(taskLedger.values()).filter((e) => e.status === "running");
}

export function clearTaskLedger(): void {
  taskLedger.clear();
}