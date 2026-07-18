/**
 * Cron Service Timer - 定时器管理
 *
 * 管理 cron 定时器的启动/停止/重置，基于 schedule 计算下次触发时间，
 * 与 service/state 集成，触发时调用 job 执行逻辑。
 */

import {
  isJobEnabled,
  hasScheduledNextRunAtMs,
  nextWakeAtMs,
  recomputeNextRuns,
  computeJobNextRunAtMs,
  errorBackoffMs,
  DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
  resolveJobLastRunStatus,
  recordScheduleComputeError,
} from "./jobs.js";
import type { CronServiceState, CronEvent } from "./state.js";
import { ensureLoaded, persist } from "./store.service.js";
import { markCronJobActive, clearCronJobActive, isCronActiveJobMarkerCurrent, type CronActiveJobMarker } from "../active-jobs.js";
import {
  createCronRunDiagnosticsFromError,
  normalizeCronRunDiagnostics,
  summarizeCronRunDiagnostics,
} from "../run-diagnostics.js";
import type {
  CronJob,
  CronRunStatus,
  CronRunOutcome,
  CronRunDiagnostics,
} from "../types.js";

const MAX_TIMER_DELAY_MS = 60_000;

/**
 * 序列化 cron 操作
 * 使用状态上的 op Promise 链确保操作按顺序执行
 */
async function serializeOp<T>(state: CronServiceState, fn: () => Promise<T>): Promise<T> {
  const next = state.op.then(fn, fn);
  state.op = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * 同一 cron 任务连续触发之间的最小间隔（毫秒）。
 * 这是一个安全网，防止 computeJobNextRunAtMs 返回与刚完成的运行在同一秒内的值时的自旋循环。
 */
const MIN_REFIRE_GAP_MS = 2_000;

type TimedCronRunOutcome = CronRunOutcome & {
  jobId: string;
  job: CronJob;
  activeJobMarker?: CronActiveJobMarker;
  startedAt: number;
  endedAt: number;
};

/**
 * 启动 cron 定时器，为下一次唤醒或维护重新检查安排时间
 */
export function armTimer(state: CronServiceState): void {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
  if (state.stopped) {
    state.deps.log.debug({}, "cron: armTimer skipped - scheduler stopped");
    return;
  }
  if (!state.deps.cronEnabled) {
    state.deps.log.debug({}, "cron: armTimer skipped - scheduler disabled");
    return;
  }
  if (state.restartRecoveryPending) {
    state.deps.log.warn({}, "cron: armTimer skipped - restart recovery pending");
    return;
  }
  const nextAt = nextWakeAtMs(state.store?.jobs ?? []);
  if (!nextAt) {
    const jobCount = state.store?.jobs.length ?? 0;
    const enabledCount = state.store?.jobs.filter((j) => j.enabled).length ?? 0;
    const withNextRun =
      state.store?.jobs.filter((j) => j.enabled && hasScheduledNextRunAtMs(j.state.nextRunAtMs))
        .length ?? 0;
    if (enabledCount > 0) {
      armRunningRecheckTimer(state);
      state.deps.log.debug(
        { jobCount, enabledCount, withNextRun, delayMs: MAX_TIMER_DELAY_MS },
        "cron: timer armed for maintenance recheck",
      );
      return;
    }
    state.deps.log.debug(
      { jobCount, enabledCount, withNextRun },
      "cron: armTimer skipped - no jobs with nextRunAtMs",
    );
    return;
  }
  const now = state.deps.nowMs();
  const delay = Math.max(nextAt - now, 0);
  const flooredDelay = delay === 0 ? MIN_REFIRE_GAP_MS : delay;
  const clampedDelay = Math.min(flooredDelay, MAX_TIMER_DELAY_MS);
  state.timer = setTimeout(() => {
    void onTimer(state).catch((err: unknown) => {
      state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
    });
  }, clampedDelay);
  state.deps.log.debug(
    { nextAt, delayMs: clampedDelay, clamped: delay > MAX_TIMER_DELAY_MS },
    "cron: timer armed",
  );
}

function armRunningRecheckTimer(state: CronServiceState): void {
  if (state.stopped) {
    return;
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = setTimeout(() => {
    void onTimer(state).catch((err: unknown) => {
      state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
    });
  }, MAX_TIMER_DELAY_MS);
}

/**
 * 停止 cron 定时器
 */
export function stopTimer(state: CronServiceState): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.stopped = true;
}

/**
 * 重置 cron 定时器（停止并重新启动）
 */
export function resetTimer(state: CronServiceState): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  armTimer(state);
}

/**
 * 处理一次 cron 定时器滴答：加载到期任务、预留、执行、持久化并重新武装
 */
export async function onTimer(state: CronServiceState): Promise<void> {
  if (state.stopped) {
    return;
  }
  if (state.restartRecoveryPending) {
    state.deps.log.warn({}, "cron: timer tick skipped - restart recovery pending");
    return;
  }
  if (state.running) {
    armRunningRecheckTimer(state);
    return;
  }
  state.running = true;
  armRunningRecheckTimer(state);
  try {
    const dueJobs = await serializeOp(state, async () => {
      await ensureLoaded(state, { forceReload: true, skipRecompute: true });
      if (state.stopped || state.restartRecoveryPending) {
        state.deps.log.warn(
          { stopped: state.stopped, restartRecoveryPending: state.restartRecoveryPending },
          "cron: due job reservation skipped - scheduler unavailable",
        );
        return [];
      }
      const dueCheckNow = state.deps.nowMs();
      const due = collectRunnableJobs(state, dueCheckNow);

      if (due.length === 0) {
        const changed = recomputeNextRunsForMaintenance(state, {
          recomputeExpired: true,
          nowMs: dueCheckNow,
        });
        if (changed) {
          await persist(state);
        }
        return [];
      }

      const now = state.deps.nowMs();
      for (const job of due) {
        job.state.runningAtMs = now;
      }
      await persist(state);
      if (state.stopped) {
        for (const job of due) {
          delete job.state.runningAtMs;
        }
        recomputeNextRunsForMaintenance(state);
        await persist(state);
        return [];
      }

      return due.map((j) => ({
        id: j.id,
        job: j,
        reservedAtMs: now,
      }));
    });

    const runDueJob = async (params: {
      id: string;
      job: CronJob;
      reservedAtMs: number;
    }): Promise<TimedCronRunOutcome> => {
      const { id, job } = params;
      const startedAt = state.deps.nowMs();
      job.state.runningAtMs = startedAt;
      job.state.lastError = undefined;
      const activeJobMarker = markCronJobActive(job.id, {
        preserveAcrossGenerationAdvance: job.sessionTarget === "main",
      });
      emit(state, { jobId: job.id, action: "started", job, runAtMs: startedAt });

      try {
        const result = await executeJob(state, job);
        return {
          jobId: id,
          job,
          activeJobMarker,
          ...result,
          startedAt,
          endedAt: state.deps.nowMs(),
        };
      } catch (err) {
        const errorText = normalizeCronRunErrorText(err);
        state.deps.log.warn(
          { jobId: id, jobName: job.name },
          `cron: job failed: ${errorText}`,
        );
        return {
          jobId: id,
          job,
          activeJobMarker,
          status: "error",
          error: errorText,
          diagnostics: createCronRunDiagnosticsFromError("cron-setup", errorText, {
            nowMs: state.deps.nowMs,
          }),
          startedAt,
          endedAt: state.deps.nowMs(),
        };
      }
    };

    const finalizeCompletedResults = async (
      completedResults: readonly TimedCronRunOutcome[],
      opts?: { clearOnFailure?: boolean },
    ): Promise<TimedCronRunOutcome[]> => {
      if (completedResults.length === 0) {
        return [];
      }
      let finalizedResults: TimedCronRunOutcome[] = [];
      let finalizationSucceeded = false;
      try {
        const currentResults = completedResults.filter((outcome) =>
          isCronActiveJobMarkerCurrent(outcome.activeJobMarker),
        );
        if (currentResults.length === 0) {
          return [];
        }
        await serializeOp(state, async () => {
          await ensureLoaded(state, { forceReload: true, skipRecompute: true });
          finalizedResults = currentResults.filter((outcome) =>
            isCronActiveJobMarkerCurrent(outcome.activeJobMarker),
          );
          for (const result of finalizedResults) {
            applyOutcomeToStoredJob(state, result);
          }
          if (finalizedResults.length === 0) {
            return;
          }
          recomputeNextRunsForMaintenance(state);
          await persist(state);
        });
        finalizationSucceeded = finalizedResults.length > 0;
        return finalizedResults;
      } finally {
        if (opts?.clearOnFailure !== false || finalizationSucceeded) {
          for (const outcome of completedResults) {
            clearCronJobActive(outcome.jobId, outcome.activeJobMarker);
          }
        }
      }
    };

    const results: TimedCronRunOutcome[] = [];
    for (const due of dueJobs) {
      if (state.stopped) {
        break;
      }
      const result = await runDueJob(due);
      results.push(result);
    }

    if (results.length > 0) {
      await finalizeCompletedResults(results);
    }
  } finally {
    state.running = false;
    armTimer(state);
  }
}

function normalizeCronRunErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

/**
 * 执行单个 cron 任务的核心逻辑
 * 这个函数在 cross-wms 中是简化版本，实际执行逻辑由上层调用者提供
 */
async function executeJob(state: CronServiceState, job: CronJob): Promise<CronRunOutcome> {
  state.deps.log.info(
    { jobId: job.id, jobName: job.name, kind: job.payload.kind },
    "cron: executing job",
  );
  if (state.deps.onJobExecute) {
    try {
      return await state.deps.onJobExecute(job);
    } catch (err) {
      return {
        status: "error",
        error: normalizeCronRunErrorText(err),
        diagnostics: createCronRunDiagnosticsFromError("agent-run", err, {
          nowMs: state.deps.nowMs,
        }),
      };
    }
  }
  return {
    status: "skipped",
    error: "no executor configured",
    diagnostics: createCronRunDiagnosticsFromError(
      "cron-preflight",
      "no job executor configured in service deps",
      { severity: "warn", nowMs: state.deps.nowMs },
    ),
  };
}

function applyOutcomeToStoredJob(state: CronServiceState, result: TimedCronRunOutcome): void {
  const store = state.store;
  if (!store) {
    return;
  }
  const job = store.jobs.find((entry) => entry.id === result.jobId);
  if (!job) {
    state.deps.log.warn(
      { jobId: result.jobId },
      "cron: applyOutcomeToStoredJob — job not found after forceReload, result discarded",
    );
    return;
  }
  applyJobResult(state, job, {
    status: result.status,
    error: result.error,
    diagnostics: result.diagnostics,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  });
  emit(state, {
    jobId: job.id,
    action: "finished",
    job,
    runAtMs: result.startedAt,
    durationMs: result.endedAt - result.startedAt,
    status: result.status,
    error: result.error,
    summary: result.diagnostics?.summary,
    diagnostics: result.diagnostics,
    nextRunAtMs: job.state.nextRunAtMs,
  });
}

/**
 * 应用运行结果状态、投递状态、退避/下次运行调度和删除后运行策略
 */
export function applyJobResult(
  state: CronServiceState,
  job: CronJob,
  result: {
    status: CronRunStatus;
    error?: string;
    diagnostics?: CronRunDiagnostics;
    startedAt: number;
    endedAt: number;
  },
): boolean {
  job.state.runningAtMs = undefined;
  job.state.lastRunAtMs = result.startedAt;
  job.state.lastRunStatus = result.status;
  job.state.lastStatus = result.status;
  job.state.lastDurationMs = Math.max(0, result.endedAt - result.startedAt);
  job.state.lastError = result.error;
  job.state.lastDiagnostics = normalizeCronRunDiagnostics(result.diagnostics);
  job.state.lastDiagnosticSummary = summarizeCronRunDiagnostics(job.state.lastDiagnostics);
  job.updatedAtMs = result.endedAt;

  if (result.status === "error") {
    state.deps.log.warn(
      {
        jobId: job.id,
        jobName: job.name,
        error: result.error,
        diagnosticsSummary: job.state.lastDiagnosticSummary,
      },
      "cron: job run returned error status",
    );
  }

  if (result.status === "error") {
    job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1;
    job.state.consecutiveSkipped = 0;
  } else if (result.status === "skipped") {
    job.state.consecutiveErrors = 0;
    job.state.consecutiveSkipped = (job.state.consecutiveSkipped ?? 0) + 1;
  } else {
    job.state.consecutiveErrors = 0;
    job.state.consecutiveSkipped = 0;
    job.state.lastFailureAlertAtMs = undefined;
  }

  const shouldDelete =
    job.schedule.kind === "at" && job.deleteAfterRun === true && result.status === "ok";

  if (!shouldDelete) {
    if (job.schedule.kind === "at") {
      if (result.status === "ok" || result.status === "skipped") {
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
      } else if (result.status === "error") {
        const backoff = errorBackoffMs(
          job.state.consecutiveErrors ?? 1,
          DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
        );
        job.state.nextRunAtMs = result.endedAt + backoff;
      }
    } else if (result.status === "error" && isJobEnabled(job)) {
      const backoff = errorBackoffMs(
        job.state.consecutiveErrors ?? 1,
        DEFAULT_ERROR_BACKOFF_SCHEDULE_MS,
      );
      let naturalNext: number | undefined;
      try {
        naturalNext = computeJobNextRunAtMs(job, result.endedAt);
      } catch (err) {
        recordScheduleComputeError({ job, err, log: state.deps.log });
      }
      const backoffNext = result.endedAt + backoff;
      job.state.nextRunAtMs =
        naturalNext !== undefined ? Math.max(naturalNext, backoffNext) : backoffNext;
    } else if (isJobEnabled(job)) {
      let naturalNext: number | undefined;
      try {
        naturalNext = computeJobNextRunAtMs(job, result.endedAt);
      } catch (err) {
        recordScheduleComputeError({ job, err, log: state.deps.log });
      }
      if (job.schedule.kind === "cron") {
        const minNext = result.endedAt + MIN_REFIRE_GAP_MS;
        job.state.nextRunAtMs =
          naturalNext !== undefined ? Math.max(naturalNext, minNext) : undefined;
      } else {
        job.state.nextRunAtMs = naturalNext;
      }
    } else {
      job.state.nextRunAtMs = undefined;
    }
  }

  return shouldDelete;
}

function collectRunnableJobs(state: CronServiceState, nowMs: number): CronJob[] {
  const jobs = state.store?.jobs ?? [];
  const due: CronJob[] = [];
  for (const job of jobs) {
    if (!job.state) {
      job.state = {};
    }
    if (!isJobEnabled(job)) {
      continue;
    }
    if (typeof job.state.runningAtMs === "number") {
      continue;
    }
    const next = job.state.nextRunAtMs;
    if (hasScheduledNextRunAtMs(next) && nowMs >= next) {
      due.push(job);
    }
  }
  return due;
}

function recomputeNextRunsForMaintenance(
  state: CronServiceState,
  opts?: {
    recomputeExpired?: boolean;
    nowMs?: number;
  },
): boolean {
  if (!state.store) {
    return false;
  }
  const nowMs = opts?.nowMs ?? state.deps.nowMs();
  return recomputeNextRuns({
    jobs: state.store.jobs,
    nowMs,
    log: state.deps.log,
  });
}

function emit(state: CronServiceState, event: CronEvent): void {
  if (state.deps.onEvent) {
    try {
      state.deps.onEvent(event);
    } catch (err) {
      state.deps.log.warn({ err: String(err) }, "cron: event listener error");
    }
  }
}
