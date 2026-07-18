import type { CronJob, CronRunOutcome, CronJobState } from "./types.js";
import type { ListPageOptions, ListPageResult } from "./service/list-page-types.js";

export interface CronServiceContract {
  loadJobs(options?: ListPageOptions): Promise<ListPageResult<CronJob>>;
  getJob(id: string): Promise<CronJob | undefined>;
  createJob(job: Omit<CronJob, "id" | "createdAtMs" | "updatedAtMs" | "state">): Promise<CronJob>;
  updateJob(id: string, patch: Partial<CronJob>): Promise<CronJob>;
  deleteJob(id: string): Promise<boolean>;
  enableJob(id: string): Promise<CronJob>;
  disableJob(id: string): Promise<CronJob>;
  runJob(id: string, mode?: "force" | "due"): Promise<CronRunOutcome>;
  getJobHistory(id: string, options?: ListPageOptions): Promise<ListPageResult<{ runId: string; status: string; timestamp: number }>>;
  getStats(): Promise<{ total: number; enabled: number; disabled: number; running: number }>;
}

export interface CronJobStorageContract {
  load(): Promise<CronJob[]>;
  save(jobs: CronJob[]): Promise<void>;
  loadQuarantine(): Promise<Array<{ job?: Partial<CronJob>; reason: string; quarantinedAtMs: number }>>;
  saveQuarantine(entries: Array<{ job?: Partial<CronJob>; reason: string; quarantinedAtMs: number }>): Promise<void>;
}

export interface CronJobExecutorContract {
  execute(job: CronJob): Promise<CronRunOutcome>;
  isRunning(jobId: string): boolean;
}

export interface CronDeliveryContract {
  deliver(job: CronJob, outcome: CronRunOutcome): Promise<void>;
  sendFailureNotification(job: CronJob, error: string): Promise<void>;
}