/**
 * Run Log - cron 运行日志记录
 *
 * 对齐 openclaw/src/cron/run-log.ts 的职责：记录每次 cron 运行的开始、成功、失败，
 * 并提供历史查询能力。cdf-know 采用进程内内存存储实现，按 jobId 分桶并保留最近
 * N 条记录，避免长跑实例无界增长。
 */

import { logger } from "../../logger.js";

/** cron 运行状态 */
export type CronRunStatus = "running" | "ok" | "error" | "skipped";

/** 单次 cron 运行日志条目 */
export interface CronRunLogEntry {
  /** 运行唯一 ID */
  runId: string;
  /** 所属 cron 任务 ID */
  jobId: string;
  /** 任务名（可选，便于人读） */
  jobName?: string;
  /** 开始时间（毫秒） */
  startTime: number;
  /** 结束时间（毫秒） */
  endTime?: number;
  /** 运行耗时（毫秒） */
  durationMs?: number;
  /** 运行状态 */
  status: CronRunStatus;
  /** 错误信息 */
  error?: string;
  /** 结构化错误原因（provider 分类等） */
  errorReason?: string;
  /** 摘要（成功/失败概要） */
  summary?: string;
  /** 投递状态 */
  deliveryStatus?: "delivered" | "not-delivered" | "unknown" | "not-requested";
}

/** 每个 jobId 最多保留的条目数 */
const DEFAULT_MAX_ENTRIES_PER_JOB = 2000;
/** 全局最多保留的条目数 */
const DEFAULT_MAX_TOTAL_ENTRIES = 50000;

interface RunLogStoreOptions {
  maxEntriesPerJob?: number;
  maxTotalEntries?: number;
}

/** 按 jobId 分桶的运行日志 */
const runsByJob = new Map<string, CronRunLogEntry[]>();
/** runId → 条目 索引，便于按 runId 更新 */
const runsById = new Map<string, CronRunLogEntry>();
/** 全局时间序条目（按 startTime 升序） */
const allRuns: CronRunLogEntry[] = [];

/** 当前生效的存储上限配置 */
let storeOptions: Required<RunLogStoreOptions> = {
  maxEntriesPerJob: DEFAULT_MAX_ENTRIES_PER_JOB,
  maxTotalEntries: DEFAULT_MAX_TOTAL_ENTRIES,
};

/** 配置运行日志存储上限（用于测试或自定义部署） */
export function configureCronRunLogStore(options: RunLogStoreOptions): void {
  storeOptions = {
    maxEntriesPerJob: Math.max(1, Math.floor(options.maxEntriesPerJob ?? DEFAULT_MAX_ENTRIES_PER_JOB)),
    maxTotalEntries: Math.max(1, Math.floor(options.maxTotalEntries ?? DEFAULT_MAX_TOTAL_ENTRIES)),
  };
}

/** 清空运行日志（用于测试） */
export function clearCronRunLogForTests(): void {
  runsByJob.clear();
  runsById.clear();
  allRuns.length = 0;
}

/** 修剪单个 jobId 桶，保留最新的 N 条 */
function trimJobBucket(jobId: string, limit: number): void {
  const bucket = runsByJob.get(jobId);
  if (!bucket || bucket.length <= limit) {
    return;
  }
  // bucket 按 startTime 升序，丢弃最旧的
  const removed = bucket.splice(0, bucket.length - limit);
  for (const entry of removed) {
    runsById.delete(entry.runId);
  }
}

/** 修剪全局时间序，保留最新的 N 条 */
function trimGlobal(limit: number): void {
  if (allRuns.length <= limit) {
    return;
  }
  const removed = allRuns.splice(0, allRuns.length - limit);
  for (const entry of removed) {
    runsById.delete(entry.runId);
    const bucket = runsByJob.get(entry.jobId);
    if (bucket) {
      const idx = bucket.indexOf(entry);
      if (idx >= 0) {
        bucket.splice(idx, 1);
      }
      if (bucket.length === 0) {
        runsByJob.delete(entry.jobId);
      }
    }
  }
}

/**
 * 记录（或更新）一次 cron 运行
 *
 * 行为：
 * - 若 runId 已存在，则合并更新（用于先记“running”再回填“ok/error”的场景）
 * - 新增时按 startTime 插入到对应桶与全局列表，并执行上限修剪
 */
export function recordCronRun(entry: CronRunLogEntry): CronRunLogEntry {
  if (!entry.runId || !entry.jobId) {
    throw new Error("invalid cron run log entry: runId and jobId are required");
  }

  const existing = runsById.get(entry.runId);
  if (existing) {
    // 合并更新：以新值覆盖旧值，保留首次记录的 startTime（若未提供新值）
    const merged: CronRunLogEntry = {
      ...existing,
      ...entry,
      startTime: entry.startTime ?? existing.startTime,
    };
    runsById.set(entry.runId, merged);
    // 同步桶内引用
    const bucket = runsByJob.get(merged.jobId);
    if (bucket) {
      const idx = bucket.findIndex((item) => item.runId === merged.runId);
      if (idx >= 0) {
        bucket[idx] = merged;
      } else {
        // jobId 变更的极端情况：补到新桶
        bucket.push(merged);
      }
    }
    // 同步全局列表引用
    const allIdx = allRuns.findIndex((item) => item.runId === merged.runId);
    if (allIdx >= 0) {
      allRuns[allIdx] = merged;
    }
    return merged;
  }

  const normalized: CronRunLogEntry = { ...entry };
  runsById.set(normalized.runId, normalized);

  let bucket = runsByJob.get(normalized.jobId);
  if (!bucket) {
    bucket = [];
    runsByJob.set(normalized.jobId, bucket);
  }
  bucket.push(normalized);
  allRuns.push(normalized);

  trimJobBucket(normalized.jobId, storeOptions.maxEntriesPerJob);
  trimGlobal(storeOptions.maxTotalEntries);

  return normalized;
}

/** 标记一次运行成功（便捷方法） */
export function recordCronRunSuccess(
  runId: string,
  endTime: number,
  summary?: string,
): CronRunLogEntry | undefined {
  const existing = runsById.get(runId);
  if (!existing) {
    logger.warn(`[cron-run-log] success update missed runId=${runId}`);
    return undefined;
  }
  return recordCronRun({
    ...existing,
    status: "ok",
    endTime,
    durationMs: endTime - existing.startTime,
    summary,
  });
}

/** 标记一次运行失败（便捷方法） */
export function recordCronRunFailure(
  runId: string,
  endTime: number,
  error: string,
  errorReason?: string,
): CronRunLogEntry | undefined {
  const existing = runsById.get(runId);
  if (!existing) {
    logger.warn(`[cron-run-log] failure update missed runId=${runId}`);
    return undefined;
  }
  return recordCronRun({
    ...existing,
    status: "error",
    endTime,
    durationMs: endTime - existing.startTime,
    error,
    errorReason,
  });
}

/** 历史查询选项 */
export interface GetCronRunHistoryOptions {
  /** 限定 jobId */
  jobId?: string;
  /** 限定 runId */
  runId?: string;
  /** 限定状态 */
  status?: CronRunStatus | "all";
  /** 限定状态集合 */
  statuses?: readonly CronRunStatus[];
  /** 文本模糊匹配（匹配 summary / error / jobName） */
  query?: string;
  /** 返回条数上限，默认 50，上限 200 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
  /** 排序方向，默认 desc（最新优先） */
  sortDir?: "asc" | "desc";
}

/** 分页结果 */
export interface CronRunHistoryPage {
  entries: CronRunLogEntry[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

function matchesStatus(entry: CronRunLogEntry, statuses: CronRunStatus[] | null): boolean {
  if (!statuses || statuses.length === 0) {
    return true;
  }
  return entry.status !== undefined && statuses.includes(entry.status);
}

function matchesQuery(entry: CronRunLogEntry, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [entry.summary ?? "", entry.error ?? "", entry.errorReason ?? "", entry.jobName ?? "", entry.jobId]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * 查询 cron 运行历史
 * 不传 jobId 时跨所有任务查询
 */
export function getCronRunHistory(options: GetCronRunHistoryOptions = {}): CronRunLogEntry[] {
  const page = getCronRunHistoryPage(options);
  return page.entries;
}

/** 分页查询 cron 运行历史（带 total / hasMore 元信息） */
export function getCronRunHistoryPage(options: GetCronRunHistoryOptions = {}): CronRunHistoryPage {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const sortDir: "asc" | "desc" = options.sortDir === "asc" ? "asc" : "desc";

  // 解析状态过滤
  let statuses: CronRunStatus[] | null = null;
  if (options.statuses && options.statuses.length > 0) {
    statuses = [...options.statuses];
  } else if (options.status && options.status !== "all") {
    statuses = [options.status];
  }

  const query = (options.query ?? "").trim().toLowerCase();

  // 选定候选集合
  let candidates: CronRunLogEntry[];
  if (options.jobId) {
    candidates = runsByJob.get(options.jobId) ?? [];
  } else {
    candidates = allRuns;
  }

  // 过滤
  const filtered = candidates.filter(
    (entry) =>
      (!options.runId || entry.runId === options.runId) &&
      matchesStatus(entry, statuses) &&
      matchesQuery(entry, query),
  );

  // 排序（拷贝后排序，避免污染内部引用）
  const sorted = filtered.slice().sort((a, b) => {
    const diff = a.startTime - b.startTime;
    return sortDir === "asc" ? diff : -diff;
  });

  const total = sorted.length;
  const boundedOffset = Math.min(total, offset);
  const entries = sorted.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + entries.length;

  return {
    entries,
    total,
    offset: boundedOffset,
    limit,
    hasMore: nextOffset < total,
    nextOffset: nextOffset < total ? nextOffset : null,
  };
}

/** 获取单个 runId 的日志条目 */
export function getCronRunEntry(runId: string): CronRunLogEntry | undefined {
  return runsById.get(runId);
}

/** 获取当前日志存储的条目总数（用于测试） */
export function getCronRunLogSizeForTests(): number {
  return allRuns.length;
}
