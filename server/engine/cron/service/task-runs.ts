import type { CronJob, CronRunOutcome } from "../types.js";

interface TaskRunRecord {
  runId: string;
  jobId: string;
  jobName: string;
  startTime: number;
  endTime?: number;
  outcome?: CronRunOutcome;
}

const taskRuns = new Map<string, TaskRunRecord[]>();

export function recordTaskRunStart(job: CronJob, runId: string): void {
  const runs = taskRuns.get(job.id) ?? [];
  runs.push({
    runId,
    jobId: job.id,
    jobName: job.name,
    startTime: Date.now(),
  });
  taskRuns.set(job.id, runs);
}

export function recordTaskRunEnd(job: CronJob, runId: string, outcome: CronRunOutcome): void {
  const runs = taskRuns.get(job.id);
  if (!runs) {
    return;
  }

  const run = runs.find((r) => r.runId === runId);
  if (run) {
    run.endTime = Date.now();
    run.outcome = outcome;
  }
}

export function getTaskRuns(jobId: string): TaskRunRecord[] {
  return taskRuns.get(jobId) ?? [];
}

export function getRecentTaskRuns(jobId: string, limit: number = 10): TaskRunRecord[] {
  const runs = taskRuns.get(jobId) ?? [];
  return [...runs].reverse().slice(0, limit);
}

export function clearTaskRuns(jobId?: string): void {
  if (jobId) {
    taskRuns.delete(jobId);
  } else {
    taskRuns.clear();
  }
}