/**
 * Cron Jobs - 任务调度计算
 *
 * 负责 cron 任务的调度计算、nextRun 计算、错误退避、启用状态判断等。
 * 对齐 openclaw/src/cron/service/jobs.ts 的核心职责，简化不必要的复杂依赖。
 */

import crypto from "node:crypto";
import { scheduleNextRun, computePreviousRunAtMs } from "../schedule.js";
import { resolveCronStaggerMs, normalizeCronStaggerMs, resolveDefaultCronStaggerMs } from "../stagger.js";
import type { CronJob, CronJobCreate, CronJobPatch } from "../types.js";

/** 默认的错误退避时间序列（毫秒） */
export const DEFAULT_ERROR_BACKOFF_SCHEDULE_MS = [
  30_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
];

/** 最大连续调度错误次数，超过后自动禁用任务 */
const MAX_SCHEDULE_ERRORS = 3;

/** 卡住运行标记的超时时间（2 小时） */
const STUCK_RUN_MS = 2 * 60 * 60 * 1000;

/** 错峰偏移缓存上限 */
const STAGGER_OFFSET_CACHE_MAX = 4096;
const staggerOffsetCache = new Map<string, number>();

/** 判断是否为有限时间戳 */
function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 判断存储的 next-run 时间戳是否有效且可调度 */
export function hasScheduledNextRunAtMs(value: unknown): value is number {
  return isFiniteTimestamp(value) && value > 0;
}

/** 解析任务的最后运行状态（兼容旧字段） */
export function resolveJobLastRunStatus(job: Pick<CronJob, "state">) {
  return job.state.lastRunStatus ?? job.state.lastStatus;
}

/**
 * 计算错误退避延迟
 * @param consecutiveErrors 连续错误次数（从 1 开始）
 * @param scheduleMs 退避时间序列
 */
export function errorBackoffMs(
  consecutiveErrors: number,
  scheduleMs = DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
): number {
  const idx = Math.min(consecutiveErrors - 1, scheduleMs.length - 1);
  return scheduleMs[Math.max(0, idx)] ?? DEFAULT_ERROR_BACKOFF_SCHEDULE_MS[0];
}

/**
 * 计算任务错误退避的结束时间戳
 * @returns 退避结束时间戳，或 undefined（不处于退避状态）
 */
export function resolveJobErrorBackoffUntilMs(
  job: CronJob,
  scheduleMs = DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
): number | undefined {
  if (resolveJobLastRunStatus(job) !== "error" || !isFiniteTimestamp(job.state.lastRunAtMs)) {
    return undefined;
  }
  const consecutiveErrorsRaw = job.state.consecutiveErrors;
  const consecutiveErrors =
    typeof consecutiveErrorsRaw === "number" && Number.isFinite(consecutiveErrorsRaw)
      ? Math.max(1, Math.floor(consecutiveErrorsRaw))
      : 1;
  const lastDurationMs =
    typeof job.state.lastDurationMs === "number" && Number.isFinite(job.state.lastDurationMs)
      ? Math.max(0, Math.floor(job.state.lastDurationMs))
      : 0;
  const lastEndedAtMs = job.state.lastRunAtMs + lastDurationMs;
  return lastEndedAtMs + errorBackoffMs(consecutiveErrors, scheduleMs);
}

/**
 * 基于 jobId 生成确定性的错峰偏移（毫秒）
 * 使用 SHA256 哈希确保同一 jobId 总是得到相同的偏移
 */
function resolveStableCronOffsetMs(jobId: string, staggerMs: number): number {
  if (staggerMs <= 1) {
    return 0;
  }
  const cacheKey = `${staggerMs}:${jobId}`;
  const cached = staggerOffsetCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const digest = crypto.createHash("sha256").update(jobId).digest();
  const offset = digest.readUInt32BE(0) % staggerMs;
  if (staggerOffsetCache.size >= STAGGER_OFFSET_CACHE_MAX) {
    const first = staggerOffsetCache.keys().next();
    if (!first.done) {
      staggerOffsetCache.delete(first.value);
    }
  }
  staggerOffsetCache.set(cacheKey, offset);
  return offset;
}

/**
 * 计算带错峰的 cron 下次运行时间
 */
function computeStaggeredCronNextRunAtMs(job: CronJob, nowMs: number): number | undefined {
  if (job.schedule.kind !== "cron") {
    return scheduleNextRun(job.schedule, nowMs);
  }

  const staggerMs = resolveCronStaggerMs(job.schedule);
  const offsetMs = resolveStableCronOffsetMs(job.id, staggerMs);
  if (offsetMs <= 0) {
    return scheduleNextRun(job.schedule, nowMs);
  }

  let cursorMs = Math.max(0, nowMs - offsetMs);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const baseNext = scheduleNextRun(job.schedule, cursorMs);
    if (baseNext === undefined) {
      return undefined;
    }
    const shifted = baseNext + offsetMs;
    if (shifted > nowMs) {
      return shifted;
    }
    cursorMs = Math.max(cursorMs + 1, baseNext + 1_000);
  }
  return undefined;
}

/**
 * 计算带错峰的 cron 上次运行时间
 */
function computeStaggeredCronPreviousRunAtMs(job: CronJob, nowMs: number): number | undefined {
  if (job.schedule.kind !== "cron") {
    return undefined;
  }

  const staggerMs = resolveCronStaggerMs(job.schedule);
  const offsetMs = resolveStableCronOffsetMs(job.id, staggerMs);
  if (offsetMs <= 0) {
    return computePreviousRunAtMs(job.schedule, nowMs);
  }

  let cursorMs = Math.max(0, nowMs - offsetMs);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const basePrevious = computePreviousRunAtMs(job.schedule, cursorMs);
    if (basePrevious === undefined) {
      return undefined;
    }
    const shifted = basePrevious + offsetMs;
    if (shifted <= nowMs) {
      return shifted;
    }
    cursorMs = Math.max(0, basePrevious - 1_000);
  }
  return undefined;
}

/**
 * 判断给定时间戳是否为该任务的有效 cron 运行时刻（含错峰）
 */
function isStaggeredCronRunAtMs(job: CronJob, runAtMs: number): boolean {
  if (job.schedule.kind !== "cron" || !isFiniteTimestamp(runAtMs)) {
    return false;
  }
  const previous = computeStaggeredCronPreviousRunAtMs(job, runAtMs + 1);
  return previous === runAtMs;
}

/** 判断任务是否启用（默认启用） */
export function isJobEnabled(job: Pick<CronJob, "enabled">): boolean {
  return job.enabled ?? true;
}

/**
 * 计算任务的下次运行时间
 * 支持 at / every / cron 三种调度类型，考虑启用状态和错误退避
 */
export function computeJobNextRunAtMs(job: CronJob, nowMs: number): number | undefined {
  if (!isJobEnabled(job)) {
    return undefined;
  }

  if (job.schedule.kind === "every") {
    const everyMsRaw = job.schedule.everyMs;
    if (!isFiniteTimestamp(everyMsRaw)) {
      return undefined;
    }
    const everyMs = Math.max(1, Math.floor(everyMsRaw));
    const lastRunAtMs = job.state.lastRunAtMs;
    if (typeof lastRunAtMs === "number" && Number.isFinite(lastRunAtMs)) {
      const nextFromLastRun = Math.floor(lastRunAtMs) + everyMs;
      if (nextFromLastRun > nowMs) {
        return nextFromLastRun;
      }
    }
    const fallbackAnchorMs = isFiniteTimestamp(job.createdAtMs) ? job.createdAtMs : nowMs;
    const anchorMs = job.schedule.anchorMs ?? fallbackAnchorMs;
    const next = scheduleNextRun({ ...job.schedule, everyMs, anchorMs }, nowMs);
    return isFiniteTimestamp(next) ? next : undefined;
  }

  if (job.schedule.kind === "at") {
    const atMs = typeof job.schedule.at === "number" ? job.schedule.at : Date.parse(job.schedule.at);
    if (!Number.isFinite(atMs)) {
      return undefined;
    }
    if (resolveJobLastRunStatus(job) === "ok" && job.state.lastRunAtMs) {
      if (atMs > job.state.lastRunAtMs) {
        return atMs;
      }
      return undefined;
    }
    return atMs > nowMs ? atMs : undefined;
  }

  const next = computeStaggeredCronNextRunAtMs(job, nowMs);
  if (next === undefined && job.schedule.kind === "cron") {
    const nextSecondMs = Math.floor(nowMs / 1000) * 1000 + 1000;
    return computeStaggeredCronNextRunAtMs(job, nextSecondMs);
  }
  return isFiniteTimestamp(next) ? next : undefined;
}

/**
 * 计算任务的上次运行时间（仅 cron 类型有效）
 */
export function computeJobPreviousRunAtMs(job: CronJob, nowMs: number): number | undefined {
  if (!isJobEnabled(job) || job.schedule.kind !== "cron") {
    return undefined;
  }
  const previous = computeStaggeredCronPreviousRunAtMs(job, nowMs);
  return isFiniteTimestamp(previous) ? previous : undefined;
}

/**
 * 记录调度计算错误，并在连续错误后自动禁用任务
 * @returns 是否发生了状态变更
 */
export function recordScheduleComputeError(params: {
  job: CronJob;
  err: unknown;
  log?: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}): boolean {
  const { job, err, log } = params;
  const errorCount = (job.state.scheduleErrorCount ?? 0) + 1;
  const errText = String(err);

  job.state.scheduleErrorCount = errorCount;
  job.state.nextRunAtMs = undefined;
  job.state.lastError = `schedule error: ${errText}`;

  if (errorCount >= MAX_SCHEDULE_ERRORS) {
    job.enabled = false;
    if (log) {
      log.error(
        { jobId: job.id, name: job.name, errorCount, err: errText },
        "cron: auto-disabled job after repeated schedule errors",
      );
    }
  } else if (log) {
    log.warn(
      { jobId: job.id, name: job.name, errorCount, err: errText },
      "cron: failed to compute next run for job (skipping)",
    );
  }

  return true;
}

/**
 * 规范化任务的 tick 状态
 * - 清理过期的 runningAtMs 标记
 * - 禁用任务时清理 nextRunAtMs
 * @returns changed: 是否发生了状态变更; skip: 是否应跳过该任务
 */
export function normalizeJobTickState(params: {
  job: CronJob;
  nowMs: number;
  log?: { warn: (...args: unknown[]) => void };
}): { changed: boolean; skip: boolean } {
  const { job, nowMs, log } = params;
  let changed = false;

  if (!job.state) {
    job.state = {};
    changed = true;
  }

  if (!isJobEnabled(job)) {
    if (job.state.nextRunAtMs !== undefined) {
      job.state.nextRunAtMs = undefined;
      changed = true;
    }
    if (job.state.runningAtMs !== undefined) {
      job.state.runningAtMs = undefined;
      changed = true;
    }
    return { changed, skip: true };
  }

  if (!hasScheduledNextRunAtMs(job.state.nextRunAtMs) && job.state.nextRunAtMs !== undefined) {
    job.state.nextRunAtMs = undefined;
    changed = true;
  }

  const runningAt = job.state.runningAtMs;
  if (typeof runningAt === "number" && nowMs - runningAt > STUCK_RUN_MS) {
    if (log) {
      log.warn(
        { jobId: job.id, runningAtMs: runningAt },
        "cron: clearing stuck running marker",
      );
    }
    job.state.runningAtMs = undefined;
    changed = true;
    const nextRun = job.state.nextRunAtMs;
    const lastRun = job.state.lastRunAtMs;
    const alreadyExecutedSlot =
      hasScheduledNextRunAtMs(nextRun) && isFiniteTimestamp(lastRun) && lastRun >= nextRun;
    return { changed, skip: !alreadyExecutedSlot };
  }

  return { changed, skip: false };
}

/**
 * 重新计算单个任务的 nextRunAtMs
 * 考虑错误退避和调度错误处理
 * @returns 是否发生了状态变更
 */
export function recomputeJobNextRunAtMs(params: {
  job: CronJob;
  nowMs: number;
  backoffScheduleMs?: number[];
  log?: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}): boolean {
  let changed = false;
  try {
    let newNext = computeJobNextRunAtMs(params.job, params.nowMs);
    if (
      params.job.schedule.kind !== "at" &&
      resolveJobLastRunStatus(params.job) === "error" &&
      isFiniteTimestamp(params.job.state.lastRunAtMs)
    ) {
      const backoffFloor = resolveJobErrorBackoffUntilMs(
        params.job,
        params.backoffScheduleMs ?? DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
      );
      if (newNext !== undefined) {
        newNext = backoffFloor !== undefined ? Math.max(newNext, backoffFloor) : newNext;
      }
    }
    if (params.job.state.nextRunAtMs !== newNext) {
      params.job.state.nextRunAtMs = newNext;
      changed = true;
    }
    if (params.job.state.scheduleErrorCount) {
      params.job.state.scheduleErrorCount = undefined;
      changed = true;
    }
  } catch (err) {
    if (recordScheduleComputeError({ job: params.job, err, log: params.log })) {
      changed = true;
    }
  }
  return changed;
}

/**
 * 重新计算所有任务的 nextRunAtMs
 * @returns 是否发生了状态变更
 */
export function recomputeNextRuns(params: {
  jobs: CronJob[];
  nowMs: number;
  backoffScheduleMs?: number[];
  log?: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}): boolean {
  let changed = false;
  for (const job of params.jobs) {
    const tick = normalizeJobTickState({ job, nowMs: params.nowMs, log: params.log });
    if (tick.changed) {
      changed = true;
    }
    if (tick.skip) {
      continue;
    }
    const nextRun = job.state.nextRunAtMs;
    const isDueOrMissing = !hasScheduledNextRunAtMs(nextRun) || params.nowMs >= nextRun;
    if (isDueOrMissing) {
      if (recomputeJobNextRunAtMs({ job, nowMs: params.nowMs, backoffScheduleMs: params.backoffScheduleMs, log: params.log })) {
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * 获取下一个唤醒时间戳（所有启用任务中最早的 nextRunAtMs）
 */
export function nextWakeAtMs(jobs: CronJob[]): number | undefined {
  const enabled = jobs.filter(
    (j) => isJobEnabled(j) && hasScheduledNextRunAtMs(j.state.nextRunAtMs),
  );
  if (enabled.length === 0) {
    return undefined;
  }
  const first = enabled[0]?.state.nextRunAtMs;
  if (!hasScheduledNextRunAtMs(first)) {
    return undefined;
  }
  return enabled.reduce((min, j) => {
    const next = j.state.nextRunAtMs;
    return hasScheduledNextRunAtMs(next) ? Math.min(min, next) : min;
  }, first);
}

/**
 * 规范化可选字符串
 */
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 规范化必填名称
 */
function normalizeRequiredName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("cron job name is required");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("cron job name cannot be empty");
  }
  return trimmed;
}

/**
 * 创建新的 cron 任务
 * 分配 ID、时间戳，计算初始调度
 */
export function createJob(input: CronJobCreate, nowMs?: number): CronJob {
  const now = nowMs ?? Date.now();
  const id = crypto.randomUUID();

  const schedule =
    input.schedule.kind === "every"
      ? {
          ...input.schedule,
          anchorMs: input.schedule.anchorMs ?? now,
        }
      : input.schedule.kind === "cron"
        ? (() => {
            const explicitStaggerMs = normalizeCronStaggerMs(input.schedule.staggerMs);
            if (explicitStaggerMs !== undefined) {
              return { ...input.schedule, staggerMs: explicitStaggerMs };
            }
            const defaultStaggerMs = resolveDefaultCronStaggerMs(input.schedule.expr);
            return defaultStaggerMs !== undefined
              ? { ...input.schedule, staggerMs: defaultStaggerMs }
              : input.schedule;
          })()
        : input.schedule;

  const deleteAfterRun =
    typeof input.deleteAfterRun === "boolean"
      ? input.deleteAfterRun
      : schedule.kind === "at"
        ? true
        : undefined;

  const enabled = typeof input.enabled === "boolean" ? input.enabled : true;

  const job: CronJob = {
    id,
    agentId: normalizeOptionalString(input.agentId),
    sessionKey: normalizeOptionalString(input.sessionKey),
    name: normalizeRequiredName(input.name),
    description: normalizeOptionalString(input.description),
    enabled,
    deleteAfterRun,
    createdAtMs: now,
    updatedAtMs: now,
    schedule,
    sessionTarget: input.sessionTarget,
    wakeMode: input.wakeMode,
    payload: input.payload,
    delivery: input.delivery,
    failureAlert: input.failureAlert,
    state: {
      ...input.state,
    },
  };

  job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
  return job;
}

/**
 * 应用任务补丁（部分更新）
 * 在原对象上就地修改
 */
export function applyJobPatch(
  job: CronJob,
  patch: CronJobPatch,
  opts?: { scheduleValidationNowMs?: number },
): void {
  if ("name" in patch && patch.name !== undefined) {
    job.name = normalizeRequiredName(patch.name);
  }
  if ("description" in patch) {
    job.description = normalizeOptionalString(patch.description);
  }
  if (typeof patch.enabled === "boolean") {
    job.enabled = patch.enabled;
  }
  if (typeof patch.deleteAfterRun === "boolean") {
    job.deleteAfterRun = patch.deleteAfterRun;
  }
  if (patch.schedule) {
    if (patch.schedule.kind === "cron") {
      const explicitStaggerMs = normalizeCronStaggerMs(patch.schedule.staggerMs);
      if (explicitStaggerMs !== undefined) {
        job.schedule = { ...patch.schedule, staggerMs: explicitStaggerMs };
      } else if (job.schedule.kind === "cron") {
        job.schedule = { ...patch.schedule, staggerMs: job.schedule.staggerMs };
      } else {
        const defaultStaggerMs = resolveDefaultCronStaggerMs(patch.schedule.expr);
        job.schedule =
          defaultStaggerMs !== undefined
            ? { ...patch.schedule, staggerMs: defaultStaggerMs }
            : patch.schedule;
      }
    } else {
      job.schedule = patch.schedule;
    }
  }
  if (patch.sessionTarget) {
    job.sessionTarget = patch.sessionTarget;
  }
  if (patch.wakeMode) {
    job.wakeMode = patch.wakeMode;
  }
  if (patch.payload) {
    job.payload = mergeCronPayload(job.payload, patch.payload);
  }
  if (patch.state) {
    job.state = { ...job.state, ...patch.state };
  }
  if ("agentId" in patch) {
    job.agentId = normalizeOptionalString((patch as { agentId?: unknown }).agentId);
  }
  if ("sessionKey" in patch) {
    job.sessionKey = normalizeOptionalString((patch as { sessionKey?: unknown }).sessionKey);
  }

  const now = opts?.scheduleValidationNowMs;
  if (now !== undefined && (patch.schedule !== undefined || patch.enabled === true)) {
    if (isJobEnabled(job)) {
      job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
    } else {
      job.state.nextRunAtMs = undefined;
    }
  }
}

/**
 * 合并 cron payload
 */
function mergeCronPayload(existing: CronJob["payload"], patch: CronJobPatch["payload"]): CronJob["payload"] {
  if (!patch) return existing;
  if (patch.kind !== existing.kind) {
    return { ...patch } as CronJob["payload"];
  }
  return { ...existing, ...patch } as CronJob["payload"];
}

/**
 * 判断任务是否到期应执行
 * @param forced 是否强制执行（忽略启用状态和 nextRunAtMs）
 */
export function isJobDue(job: CronJob, nowMs: number, opts: { forced: boolean }): boolean {
  if (!job.state) {
    job.state = {};
  }
  if (typeof job.state.runningAtMs === "number") {
    return false;
  }
  if (opts.forced) {
    return true;
  }
  return (
    isJobEnabled(job) &&
    hasScheduledNextRunAtMs(job.state.nextRunAtMs) &&
    nowMs >= job.state.nextRunAtMs
  );
}

/**
 * 查找任务，找不到则抛出错误
 */
export function findJobOrThrow(jobs: CronJob[], id: string): CronJob {
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error(`unknown cron job id: ${id}`);
  }
  return job;
}
