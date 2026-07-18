import type { CronRunLogEntry } from "./index.js";

export function encodeCronRunLogEntry(entry: CronRunLogEntry): Record<string, unknown> {
  return {
    runId: entry.runId,
    jobId: entry.jobId,
    jobName: entry.jobName ?? null,
    startTime: entry.startTime,
    endTime: entry.endTime ?? null,
    durationMs: entry.durationMs ?? null,
    status: entry.status,
    error: entry.error ?? null,
    errorReason: entry.errorReason ?? null,
    summary: entry.summary ?? null,
    deliveryStatus: entry.deliveryStatus ?? null,
  };
}

export function decodeCronRunLogEntry(raw: Record<string, unknown>): CronRunLogEntry | null {
  if (typeof raw.runId !== "string" || typeof raw.jobId !== "string") {
    return null;
  }
  if (typeof raw.startTime !== "number") {
    return null;
  }
  if (typeof raw.status !== "string") {
    return null;
  }

  return {
    runId: raw.runId,
    jobId: raw.jobId,
    jobName: typeof raw.jobName === "string" ? raw.jobName : undefined,
    startTime: raw.startTime,
    endTime: typeof raw.endTime === "number" ? raw.endTime : undefined,
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : undefined,
    status: raw.status as CronRunLogEntry["status"],
    error: typeof raw.error === "string" ? raw.error : undefined,
    errorReason: typeof raw.errorReason === "string" ? raw.errorReason : undefined,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    deliveryStatus: typeof raw.deliveryStatus === "string" ? (raw.deliveryStatus as CronRunLogEntry["deliveryStatus"]) : undefined,
  };
}