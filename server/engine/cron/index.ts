/**
 * Cron Engine - Cron 服务增强模块
 * 包含持久化存储、重试机制和错峰调度功能
 */

// Store - 持久化存储
export {
  JsonCronJobStore,
  getDefaultCronStore,
  setDefaultCronStore,
  resolveCronStorePath,
  resolveQuarantinePath,
  quarantineEntries,
} from "./store";

export type {
  CronJobConfig,
  CronJobRuntime,
  CronJobEntry,
  CronStoreFile,
  CronQuarantineFile,
  CronQuarantineEntry,
  LoadedCronStore,
  CronJobStore,
} from "./store";

// Retry - 重试机制
export {
  withRetry,
  RetryTracker,
  createRetryTracker,
  RETRY_CONFIGS,
  DEFAULT_RETRY_CONFIG,
} from "./retry";

export type { RetryConfig, RetryState, RetryResult } from "./retry";

// Stagger - 错峰调度
export {
  isRecurringTopOfHourCronExpr,
  normalizeCronStaggerMs,
  resolveDefaultCronStaggerMs,
  resolveCronStaggerMs,
  calculateStaggerWindow,
  shouldStaggerJob,
  StaggerScheduler,
  getGlobalStaggerScheduler,
  resetGlobalStaggerScheduler,
} from "./stagger";

export type { CronSchedule, StaggerWindow } from "./stagger";
