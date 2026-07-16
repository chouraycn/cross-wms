/**
 * Cron Ops - CRUD 操作层
 *
 * 封装 cron 任务的所有对外操作：增删改查、手动运行、状态管理等。
 * 调用 store 模块进行持久化，调用 jobs 模块进行调度计算。
 *
 * 设计原则：
 * - 所有对外操作都通过本模块封装
 * - 内部维护内存中的任务列表
 * - 变更后自动持久化
 */

import {
  JsonCronJobStore,
  getDefaultCronStore,
  type CronJobStore,
  type CronStoreFile,
  type LoadedCronStore,
} from "../store.js";
import {
  createJob,
  applyJobPatch,
  findJobOrThrow,
  isJobEnabled,
  isJobDue,
  recomputeNextRuns,
  nextWakeAtMs,
  hasScheduledNextRunAtMs,
  resolveJobLastRunStatus,
  computeJobNextRunAtMs,
} from "./jobs.js";
import type { CronJob, CronJobCreate, CronJobPatch } from "../types.js";
import { recordCronRun, recordCronRunSuccess, recordCronRunFailure } from "../run-log.js";
import { logger } from "../../../logger.js";

/**
 * Cron Service 状态
 * 维护内存中的任务列表、存储实例和配置
 */
export interface CronServiceState {
  /** 存储实例 */
  store: CronJobStore;
  /** 内存中的任务列表 */
  jobs: CronJob[];
  /** 是否已加载 */
  loaded: boolean;
  /** 是否停止 */
  stopped: boolean;
  /** 配置选项 */
  options: CronServiceOptions;
  /** 事件回调 */
  listeners: Set<CronEventListener>;
  /** 操作序列化 Promise 链，用于锁定机制 */
  op: Promise<unknown>;
}

/** Cron 事件类型 */
export type CronEventType = "added" | "updated" | "removed" | "started" | "finished";

/** Cron 事件 */
export interface CronEvent {
  type: CronEventType;
  jobId: string;
  job?: CronJob;
  runId?: string;
  status?: string;
  error?: string;
  nextRunAtMs?: number;
}

/** Cron 事件监听器 */
export type CronEventListener = (event: CronEvent) => void;

/** Cron Service 配置选项 */
export interface CronServiceOptions {
  /** 存储文件路径 */
  storePath?: string;
  /** 是否启用 cron */
  enabled?: boolean;
  /** 错误退避时间序列（毫秒） */
  errorBackoffScheduleMs?: number[];
}

/** 列表查询选项 */
export interface CronListOptions {
  /** 是否包含禁用的任务 */
  includeDisabled?: boolean;
  /** 搜索关键词（匹配 name/description/id） */
  query?: string;
  /** 排序字段 */
  sortBy?: "nextRunAtMs" | "name" | "updatedAtMs";
  /** 排序方向 */
  sortDir?: "asc" | "desc";
  /** 偏移量 */
  offset?: number;
  /** 返回条数限制 */
  limit?: number;
}

/** 分页结果 */
export interface CronListResult {
  jobs: CronJob[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/** 手动运行结果 */
export interface CronRunResult {
  ok: boolean;
  ran?: boolean;
  reason?: "already-running" | "not-due" | "not-found" | "stopped";
  runId?: string;
}

/**
 * 创建 CronServiceState
 */
export function createCronServiceState(options?: CronServiceOptions): CronServiceState {
  const store = options?.storePath
    ? new JsonCronJobStore(options.storePath)
    : getDefaultCronStore();

  return {
    store,
    jobs: [],
    loaded: false,
    stopped: false,
    options: {
      enabled: options?.enabled ?? true,
      ...options,
    },
    listeners: new Set(),
    op: Promise.resolve(),
  };
}

/**
 * 确保存储数据已加载
 */
export async function ensureLoaded(state: CronServiceState): Promise<void> {
  if (state.loaded) {
    return;
  }
  const loaded = await state.store.load();
  state.jobs = loaded.store.jobs;
  state.loaded = true;

  if (state.options.enabled !== false) {
    recomputeNextRuns({
      jobs: state.jobs,
      nowMs: Date.now(),
      backoffScheduleMs: state.options.errorBackoffScheduleMs,
    });
    await persist(state);
  }
}

/**
 * 持久化当前状态
 */
export async function persist(state: CronServiceState): Promise<void> {
  const storeFile: CronStoreFile = {
    version: 1,
    jobs: state.jobs,
  };
  await state.store.save(storeFile);
}

/**
 * 注册事件监听器
 */
export function addListener(state: CronServiceState, listener: CronEventListener): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/**
 * 触发事件
 */
function emit(state: CronServiceState, event: CronEvent): void {
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch (err) {
      logger.warn({ err }, "[cron-ops] event listener error");
    }
  }
}

/**
 * 获取服务状态
 */
export async function status(state: CronServiceState) {
  await ensureLoaded(state);
  return {
    enabled: state.options.enabled !== false,
    storePath: state.store.getStorePath(),
    jobs: state.jobs.length,
    nextWakeAtMs: state.options.enabled !== false ? nextWakeAtMs(state.jobs) ?? null : null,
  };
}

/**
 * 列出所有 cron 任务
 */
export async function list(state: CronServiceState, opts?: CronListOptions): Promise<CronJob[]> {
  await ensureLoaded(state);
  const result = listPage(state, {
    ...opts,
    limit: opts?.limit ?? state.jobs.length,
  });
  return result.jobs;
}

/**
 * 分页列出 cron 任务
 */
export function listPage(state: CronServiceState, opts?: CronListOptions): CronListResult {
  const includeDisabled = opts?.includeDisabled === true;
  const query = (opts?.query ?? "").trim().toLowerCase();
  const sortBy = opts?.sortBy ?? "nextRunAtMs";
  const sortDir = opts?.sortDir ?? "asc";

  const filtered = state.jobs.filter((job) => {
    if (!includeDisabled && !isJobEnabled(job)) {
      return false;
    }
    if (query) {
      const haystack = [job.id, job.name, job.description ?? "", job.agentId ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });

  const sorted = filtered.toSorted((a, b) => {
    let cmp: number;
    if (sortBy === "name") {
      cmp = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
    } else if (sortBy === "updatedAtMs") {
      cmp = a.updatedAtMs - b.updatedAtMs;
    } else {
      const aNext = a.state.nextRunAtMs;
      const bNext = b.state.nextRunAtMs;
      if (typeof aNext === "number" && typeof bNext === "number") {
        cmp = aNext - bNext;
      } else if (typeof aNext === "number") {
        cmp = -1;
      } else if (typeof bNext === "number") {
        cmp = 1;
      } else {
        cmp = 0;
      }
    }
    if (cmp !== 0) {
      return sortDir === "desc" ? -cmp : cmp;
    }
    return a.id.localeCompare(b.id);
  });

  const total = sorted.length;
  const offset = Math.max(0, Math.min(total, Math.floor(opts?.offset ?? 0)));
  const limit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? Math.max(50, total))));
  const jobs = sorted.slice(offset, offset + limit);
  const nextOffset = offset + jobs.length;

  return {
    jobs,
    total,
    offset,
    limit,
    hasMore: nextOffset < total,
  };
}

/**
 * 读取单个 cron 任务
 */
export async function readJob(state: CronServiceState, id: string): Promise<CronJob | undefined> {
  await ensureLoaded(state);
  return state.jobs.find((job) => job.id === id);
}

/**
 * 添加 cron 任务
 */
export async function add(state: CronServiceState, input: CronJobCreate): Promise<CronJob> {
  if (state.options.enabled === false) {
    throw new Error("cron service is disabled");
  }
  await ensureLoaded(state);

  const job = createJob(input);
  state.jobs.push(job);

  recomputeNextRuns({
    jobs: state.jobs,
    nowMs: Date.now(),
    backoffScheduleMs: state.options.errorBackoffScheduleMs,
  });

  await persist(state);

  logger.info(
    {
      jobId: job.id,
      jobName: job.name,
      nextRunAtMs: job.state.nextRunAtMs,
    },
    "[cron-ops] job added",
  );

  emit(state, {
    type: "added",
    jobId: job.id,
    job,
    nextRunAtMs: job.state.nextRunAtMs,
  });

  return job;
}

/**
 * 更新 cron 任务
 */
export async function update(
  state: CronServiceState,
  id: string,
  patch: CronJobPatch,
): Promise<CronJob> {
  if (state.options.enabled === false) {
    throw new Error("cron service is disabled");
  }
  await ensureLoaded(state);

  const job = findJobOrThrow(state.jobs, id);
  const now = Date.now();
  const nextJob = structuredClone(job);

  applyJobPatch(nextJob, patch, { scheduleValidationNowMs: now });

  nextJob.updatedAtMs = now;

  const scheduleChanged = patch.schedule !== undefined;
  const enabledChanged = patch.enabled !== undefined;

  if (scheduleChanged || enabledChanged) {
    if (isJobEnabled(nextJob)) {
      nextJob.state.nextRunAtMs = computeJobNextRunAtMs(nextJob, now);
    } else {
      nextJob.state.nextRunAtMs = undefined;
      nextJob.state.runningAtMs = undefined;
    }
  } else if (isJobEnabled(nextJob) && !hasScheduledNextRunAtMs(nextJob.state.nextRunAtMs)) {
    nextJob.state.nextRunAtMs = computeJobNextRunAtMs(nextJob, now);
  }

  const index = state.jobs.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    state.jobs[index] = nextJob;
  }

  recomputeNextRuns({
    jobs: state.jobs,
    nowMs: now,
    backoffScheduleMs: state.options.errorBackoffScheduleMs,
  });

  await persist(state);

  emit(state, {
    type: "updated",
    jobId: id,
    job: nextJob,
    nextRunAtMs: nextJob.state.nextRunAtMs,
  });

  return nextJob;
}

/**
 * 删除 cron 任务
 */
export async function remove(state: CronServiceState, id: string): Promise<{ ok: boolean; removed: boolean }> {
  if (state.options.enabled === false) {
    throw new Error("cron service is disabled");
  }
  await ensureLoaded(state);

  const before = state.jobs.length;
  const removedJob = state.jobs.find((j) => j.id === id);
  state.jobs = state.jobs.filter((j) => j.id !== id);
  const removed = state.jobs.length !== before;

  if (removed) {
    await persist(state);

    emit(state, {
      type: "removed",
      jobId: id,
      job: removedJob,
    });

    logger.info({ jobId: id }, "[cron-ops] job removed");
  }

  return { ok: true, removed };
}

/**
 * 启用/禁用 cron 任务
 */
export async function setEnabled(
  state: CronServiceState,
  id: string,
  enabled: boolean,
): Promise<CronJob> {
  return update(state, id, { enabled });
}

/**
 * 手动触发 cron 任务
 * @param mode "due" 仅在到期时运行；"force" 强制执行
 */
export async function run(
  state: CronServiceState,
  id: string,
  mode: "due" | "force" = "force",
): Promise<CronRunResult> {
  if (state.options.enabled === false) {
    return { ok: false, reason: "stopped" };
  }
  if (state.stopped) {
    return { ok: false, reason: "stopped" };
  }
  await ensureLoaded(state);

  const job = state.jobs.find((j) => j.id === id);
  if (!job) {
    return { ok: false, reason: "not-found" };
  }

  const now = Date.now();

  if (typeof job.state.runningAtMs === "number") {
    return { ok: true, ran: false, reason: "already-running" };
  }

  const due = isJobDue(job, now, { forced: mode === "force" });
  if (!due) {
    return { ok: true, ran: false, reason: "not-due" };
  }

  const runId = `manual:${id}:${now}`;
  job.state.runningAtMs = now;
  await persist(state);

  recordCronRun({
    runId,
    jobId: id,
    jobName: job.name,
    startTime: now,
    status: "running",
  });

  emit(state, {
    type: "started",
    jobId: id,
    job,
    runId,
  });

  return {
    ok: true,
    ran: true,
    runId,
  };
}

/**
 * 标记任务运行完成
 */
export async function markRunComplete(
  state: CronServiceState,
  id: string,
  runId: string,
  result: {
    status: "ok" | "error" | "skipped";
    error?: string;
    summary?: string;
  },
): Promise<void> {
  await ensureLoaded(state);

  const job = state.jobs.find((j) => j.id === id);
  if (!job) {
    return;
  }

  const now = Date.now();
  const startTime = job.state.runningAtMs ?? now;
  const durationMs = now - startTime;

  job.state.lastRunAtMs = startTime;
  job.state.lastRunStatus = result.status;
  job.state.lastStatus = result.status;
  job.state.lastError = result.error;
  job.state.lastDurationMs = durationMs;
  job.state.runningAtMs = undefined;

  if (result.status === "ok") {
    job.state.lastSuccessAtMs = startTime;
    job.state.consecutiveErrors = 0;
    job.state.consecutiveSkipped = 0;
    recordCronRunSuccess(runId, now, result.summary);
  } else if (result.status === "error") {
    job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1;
    recordCronRunFailure(runId, now, result.error ?? "unknown error");
  } else {
    job.state.consecutiveSkipped = (job.state.consecutiveSkipped ?? 0) + 1;
  }

  const shouldDelete = job.deleteAfterRun && result.status !== "error";
  if (shouldDelete) {
    state.jobs = state.jobs.filter((j) => j.id !== id);
  } else {
    recomputeNextRuns({
      jobs: state.jobs,
      nowMs: now,
      backoffScheduleMs: state.options.errorBackoffScheduleMs,
    });
  }

  await persist(state);

  emit(state, {
    type: "finished",
    jobId: id,
    job: shouldDelete ? undefined : job,
    runId,
    status: result.status,
    error: result.error,
    nextRunAtMs: shouldDelete ? undefined : job.state.nextRunAtMs,
  });
}

/**
 * 获取下一个到期的任务
 */
export function getDueJobs(state: CronServiceState, nowMs?: number): CronJob[] {
  const now = nowMs ?? Date.now();
  return state.jobs.filter((job) => isJobDue(job, now, { forced: false }));
}

/**
 * 重新计算所有任务的调度
 */
export async function refreshSchedules(state: CronServiceState): Promise<void> {
  await ensureLoaded(state);
  recomputeNextRuns({
    jobs: state.jobs,
    nowMs: Date.now(),
    backoffScheduleMs: state.options.errorBackoffScheduleMs,
  });
  await persist(state);
}

/**
 * 停止 cron 服务（仅标记状态，不修改持久化数据）
 */
export function stop(state: CronServiceState): void {
  state.stopped = true;
}

/**
 * 启动 cron 服务
 */
export async function start(state: CronServiceState): Promise<void> {
  state.stopped = false;
  await ensureLoaded(state);
}

/**
 * 批量获取任务统计
 */
export function getStats(state: CronServiceState) {
  const total = state.jobs.length;
  const enabled = state.jobs.filter(isJobEnabled).length;
  const disabled = total - enabled;
  const withError = state.jobs.filter((j) => resolveJobLastRunStatus(j) === "error").length;
  const nextWake = nextWakeAtMs(state.jobs);

  return {
    total,
    enabled,
    disabled,
    withError,
    nextWakeAtMs: nextWake ?? null,
  };
}
