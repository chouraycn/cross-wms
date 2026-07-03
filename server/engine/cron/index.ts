/**
 * Cron Engine - Cron 服务增强模块
 * 包含持久化存储、重试机制、错峰调度、调度计算、时间解析、任务规范化、
 * 投递系统、错误分类和运行日志功能
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

// Parse - 时间解析
export {
  parseAbsoluteTime,
  parseAbsoluteTimeMs,
  normalizeToUtc,
  isValidIso8601,
} from "./parse";

// Schedule - 调度计算
export {
  scheduleNextRun,
  parseScheduleType,
  computePreviousRunAtMs,
  clearCronScheduleCacheForTest,
  getCronScheduleCacheSizeForTest,
  getCronScheduleCacheMaxForTest,
  hasCronInCacheForTest,
} from "./schedule";

export type {
  ScheduleType,
  AtSchedule,
  EverySchedule,
  CronExprSchedule,
  CronSchedule as CronScheduleSpec,
  CronScheduleInput,
} from "./schedule";

// Normalize - 任务规范化
export {
  normalizeCronJob,
  normalizeCronJobCreate,
  normalizeCronJobPatch,
  inferCronJobName,
} from "./normalize";

export type {
  CronPayloadType,
  CronSessionTarget,
  CronWakeMode,
  NormalizeCronJobOptions,
  InferCronJobNameInput,
} from "./normalize";

// Delivery - 投递系统
export {
  sendCronAnnouncePayloadStrict,
  sendFailureNotificationAnnounce,
  resolveFailureDestination,
} from "./delivery";

export type {
  CronAnnounceTarget,
  CronDeliveryTarget,
  CronDeliveryResult,
  CronFailureDestinationInput,
  CronDeliveryAdapter,
} from "./delivery";

// Retry Hint - 五类瞬态错误分类
export {
  classifyCronError,
  shouldRetryCronError,
} from "./retry-hint";

export type { CronErrorCategory, CronErrorClassification } from "./retry-hint";

// Run Log - 运行日志记录
export {
  recordCronRun,
  recordCronRunSuccess,
  recordCronRunFailure,
  getCronRunHistory,
  getCronRunHistoryPage,
  getCronRunEntry,
  configureCronRunLogStore,
  clearCronRunLogForTests,
  getCronRunLogSizeForTests,
} from "./run-log";

export type {
  CronRunStatus,
  CronRunLogEntry,
  GetCronRunHistoryOptions,
  CronRunHistoryPage,
} from "./run-log";
