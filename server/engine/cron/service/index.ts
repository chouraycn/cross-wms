/**
 * Cron Service Barrel Export
 *
 * 统一导出 cron 服务层的所有类型和函数。
 */

export {
  createCronServiceState,
  type CronServiceState,
  type CronServiceDeps,
  type CronServiceDepsInternal,
  type CronEvent,
  type CronJobExecutor,
  type EnqueueSystemEventOptions,
  type RequestHeartbeatOptions,
} from "./state.js";

export {
  isJobEnabled,
  isJobDue,
  hasScheduledNextRunAtMs,
  nextWakeAtMs,
  recomputeNextRuns,
  computeJobNextRunAtMs,
  errorBackoffMs,
  DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
  resolveJobLastRunStatus,
  recordScheduleComputeError,
  createJob,
  applyJobPatch,
  findJobOrThrow,
} from "./jobs.js";

export { locked } from "./locked.js";
export {
  normalizeRequiredName,
  normalizeOptionalAgentId,
  inferCronJobName,
  normalizePayloadToSystemText,
} from "./normalize.js";
export * from "./ops.js";
export {
  ensureLoaded,
  persist,
  warnIfDisabled,
  flushPendingQuarantine,
} from "./store.service.js";
export { armTimer, stopTimer, resetTimer, onTimer, applyJobResult } from "./timer.js";
export {
  recordTimerStart,
  detectWake,
  handleSystemWake,
  wake,
  handleMissedJobs,
  resetWakeDetection,
} from "./wake.js";

export * from "./agent-watchdog.js";
export * from "./execution-errors.js";
export * from "./failure-alerts.js";
export * from "./initial-delivery.js";
export * from "./task-ledger.js";
export * from "./task-runs.js";
export * from "./timeout-policy.js";
export * from "./list-page-types.js";
