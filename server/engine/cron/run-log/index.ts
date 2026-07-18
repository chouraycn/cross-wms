export type CronRunLogStatus = "running" | "ok" | "error" | "skipped";

export interface CronRunLogEntry {
  runId: string;
  jobId: string;
  jobName?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: CronRunLogStatus;
  error?: string;
  errorReason?: string;
  summary?: string;
  deliveryStatus?: "delivered" | "not-delivered" | "unknown" | "not-requested";
}

export interface GetCronRunHistoryOptions {
  jobId?: string;
  runId?: string;
  status?: CronRunLogStatus | "all";
  statuses?: readonly CronRunLogStatus[];
  query?: string;
  limit?: number;
  offset?: number;
  sortDir?: "asc" | "desc";
}

export interface CronRunHistoryPage {
  entries: CronRunLogEntry[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export * from "./entry-codec.js";
export * from "./sqlite-store.js";