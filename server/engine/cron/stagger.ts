/**
 * Stagger - 错峰调度
 * 实现 cron 任务的错峰调度，防止多任务在同一时刻同时执行造成 thundering herd 问题
 */

/** 默认的整点 cron 错峰窗口（5分钟） */
const DEFAULT_TOP_OF_HOUR_STAGGER_MS = 5 * 60 * 1000;

/** 解析严格的非负整数 */
function parseStrictNonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** 解析 cron 表达式字段 */
function parseCronFields(expr: string): string[] {
  return expr.trim().split(/\s+/).filter(Boolean);
}

/** 小时字段列表部分的正则 */
const HOUR_LIST_PART = /^(?:\d+|\d+-\d+)(?:\/\d+)?$|^[*?](?:\/\d+)?$/;

/** 检查小时字段是否包含循环通配符 */
function hasRecurringWildcardHour(field: string): boolean {
  const parts = field.split(",");
  return (
    parts.every((part) => HOUR_LIST_PART.test(part)) &&
    parts.some((part) => part.startsWith("*") || part.startsWith("?"))
  );
}

/**
 * 判断 cron 表达式是否为每小时整点执行的循环任务
 * 例如: "0 * * * *" (每小时的第0分钟) 或 "0 0 * * * *" (每小时的第0分0秒)
 */
export function isRecurringTopOfHourCronExpr(expr: string): boolean {
  const fields = parseCronFields(expr);

  // 5 字段格式: minute hour dayOfMonth month dayOfWeek
  if (fields.length === 5) {
    const [minuteField, hourField] = fields;
    return minuteField === "0" && hasRecurringWildcardHour(hourField);
  }

  // 6 字段格式: second minute hour dayOfMonth month dayOfWeek
  if (fields.length === 6) {
    const [secondField, minuteField, hourField] = fields;
    return secondField === "0" && minuteField === "0" && hasRecurringWildcardHour(hourField);
  }

  return false;
}

/**
 * 规范化错峰毫秒值
 * @param raw 原始值
 * @returns 规范化的毫秒值，或 undefined（如果无效）
 */
export function normalizeCronStaggerMs(raw: unknown): number | undefined {
  let numeric: number;

  if (typeof raw === "number") {
    numeric = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    const parsed = parseStrictNonNegativeInteger(raw);
    numeric = parsed ?? Number.NaN;
  } else {
    numeric = Number.NaN;
  }

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return Math.max(0, Math.floor(numeric));
}

/**
 * 获取整点 cron 表达式的默认错峰窗口
 * @param expr cron 表达式
 * @returns 默认错峰毫秒数，或 undefined（如果不是整点循环任务）
 */
export function resolveDefaultCronStaggerMs(expr: string): number | undefined {
  return isRecurringTopOfHourCronExpr(expr) ? DEFAULT_TOP_OF_HOUR_STAGGER_MS : undefined;
}

/** Cron 调度类型 */
export type CronSchedule =
  | { kind: "cron"; expr: string; staggerMs?: number }
  | { kind: "interval"; intervalMs: number };

/**
 * 解析有效的错峰毫秒数
 * @param schedule cron 调度配置
 * @returns 有效的错峰毫秒数
 */
export function resolveCronStaggerMs(schedule: CronSchedule): number {
  if (schedule.kind === "interval") {
    return 0;
  }

  const explicit = normalizeCronStaggerMs(schedule.staggerMs);
  if (explicit !== undefined) {
    return explicit;
  }

  return resolveDefaultCronStaggerMs(schedule.expr) ?? 0;
}

/** 错峰窗口信息 */
export interface StaggerWindow {
  /** 窗口开始时间（毫秒） */
  startMs: number;
  /** 窗口结束时间（毫秒） */
  endMs: number;
  /** 窗口大小（毫秒） */
  sizeMs: number;
  /** 分配的延迟（毫秒） */
  delayMs: number;
  /** 是否在窗口内 */
  isWithinWindow: boolean;
}

/**
 * 计算错峰窗口
 * @param staggerMs 错峰毫秒数
 * @param nowMs 当前时间（毫秒）
 * @param jobId 任务 ID（用于确定性的随机偏移）
 * @returns 错峰窗口信息
 */
export function calculateStaggerWindow(
  staggerMs: number,
  nowMs: number,
  jobId: string,
): StaggerWindow {
  const windowStart = nowMs;
  const windowEnd = nowMs + staggerMs;
  const sizeMs = staggerMs;

  // 基于 jobId 生成确定性的延迟
  // 使用简单的哈希函数确保同一 jobId 总是得到相同的延迟
  let hash = 0;
  for (let i = 0; i < jobId.length; i++) {
    const char = jobId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // 将哈希转换为 0 到 staggerMs 之间的值
  const delayMs = Math.abs(hash % Math.max(1, staggerMs));

  const isWithinWindow = nowMs >= windowStart && nowMs <= windowEnd;

  return {
    startMs: windowStart,
    endMs: windowEnd,
    sizeMs,
    delayMs,
    isWithinWindow,
  };
}

/**
 * 判断是否应该等待错峰窗口
 * @param staggerMs 错峰毫秒数
 * @param nowMs 当前时间（毫秒）
 * @param jobId 任务 ID
 * @returns 如果应该等待，返回等待的毫秒数；否则返回 0
 */
export function shouldStaggerJob(
  staggerMs: number,
  nowMs: number,
  jobId: string,
): number {
  if (staggerMs <= 0) {
    return 0;
  }

  const window = calculateStaggerWindow(staggerMs, nowMs, jobId);

  // 如果已经在窗口外，不需要等待
  if (!window.isWithinWindow) {
    return 0;
  }

  // 返回分配的延迟
  return window.delayMs;
}

/**
 * 创建错峰调度器
 * 用于管理多个任务的错峰执行
 */
export class StaggerScheduler {
  private scheduledJobs: Map<string, { scheduledMs: number; staggerMs: number }> = new Map();

  /**
   * 安排一个任务在错峰窗口内执行
   * @param jobId 任务 ID
   * @param staggerMs 错峰毫秒数
   * @param baseTimeMs 基准时间（默认为当前时间）
   * @returns 安排的实际执行时间
   */
  scheduleJob(jobId: string, staggerMs: number, baseTimeMs?: number): number {
    const nowMs = baseTimeMs ?? Date.now();
    const delay = shouldStaggerJob(staggerMs, nowMs, jobId);
    const scheduledMs = nowMs + delay;

    this.scheduledJobs.set(jobId, { scheduledMs, staggerMs });

    return scheduledMs;
  }

  /**
   * 获取任务已安排的执行时间
   * @param jobId 任务 ID
   * @returns 已安排的执行时间，或 undefined（如果任务未安排）
   */
  getScheduledTime(jobId: string): number | undefined {
    return this.scheduledJobs.get(jobId)?.scheduledMs;
  }

  /**
   * 取消已安排的任务
   * @param jobId 任务 ID
   * @returns 是否成功取消
   */
  cancelJob(jobId: string): boolean {
    return this.scheduledJobs.delete(jobId);
  }

  /**
   * 检查任务是否应该现在执行
   * @param jobId 任务 ID
   * @param nowMs 当前时间（默认为当前时间）
   * @returns 是否应该执行
   */
  shouldExecuteNow(jobId: string, nowMs?: number): boolean {
    const scheduled = this.scheduledJobs.get(jobId);
    if (!scheduled) {
      return true; // 未安排的任务立即执行
    }

    const currentTime = nowMs ?? Date.now();
    return currentTime >= scheduled.scheduledMs;
  }

  /**
   * 获取还需要等待的时间
   * @param jobId 任务 ID
   * @param nowMs 当前时间（默认为当前时间）
   * @returns 还需要等待的毫秒数，0 表示可以立即执行
   */
  getWaitTime(jobId: string, nowMs?: number): number {
    const scheduled = this.scheduledJobs.get(jobId);
    if (!scheduled) {
      return 0;
    }

    const currentTime = nowMs ?? Date.now();
    return Math.max(0, scheduled.scheduledMs - currentTime);
  }

  /**
   * 获取当前所有已安排的任务
   */
  getScheduledJobs(): Map<string, { scheduledMs: number; staggerMs: number }> {
    return new Map(this.scheduledJobs);
  }

  /**
   * 清除所有已安排的任务
   */
  clear(): void {
    this.scheduledJobs.clear();
  }

  /**
   * 清除已过期的任务安排
   * @param nowMs 当前时间（默认为当前时间）
   */
  clearExpired(nowMs?: number): void {
    const currentTime = nowMs ?? Date.now();
    for (const [jobId, { scheduledMs }] of this.scheduledJobs) {
      if (currentTime > scheduledMs) {
        this.scheduledJobs.delete(jobId);
      }
    }
  }
}

/** 全局错峰调度器实例 */
let globalStaggerScheduler: StaggerScheduler | null = null;

/** 获取全局错峰调度器 */
export function getGlobalStaggerScheduler(): StaggerScheduler {
  if (!globalStaggerScheduler) {
    globalStaggerScheduler = new StaggerScheduler();
  }
  return globalStaggerScheduler;
}

/** 重置全局错峰调度器（用于测试） */
export function resetGlobalStaggerScheduler(): void {
  globalStaggerScheduler = null;
}
