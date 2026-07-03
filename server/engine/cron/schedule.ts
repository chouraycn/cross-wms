/**
 * Schedule - 调度计算
 *
 * 对齐 openclaw/src/cron/schedule.ts：计算 at / every / cron 三种调度类型的下次运行时间。
 *
 * 三种调度类型：
 * - at    ：绝对时间单次触发（仅当 at > now 时返回 at）
 * - every ：固定间隔触发，支持 anchorMs 锚点对齐
 * - cron  ：标准 cron 表达式（由 croner 库解析）
 *
 * 性能：croner 表达式解析较重，使用 LRU 缓存（最多 512 个），按
 * `${timezone}\u0000${expr}` 键缓存 Cron 实例。
 */

import { Cron } from "croner";
import { parseAbsoluteTime } from "./parse.js";

/** 调度类型 */
export type ScheduleType = "at" | "every" | "cron";

/** at 调度：绝对时间单次 */
export interface AtSchedule {
  kind: "at";
  /** ISO 8601 字符串或 epoch 毫秒 */
  at: string | number;
}

/** every 调度：固定间隔 + 锚点 */
export interface EverySchedule {
  kind: "every";
  /** 间隔毫秒，最小 1 */
  everyMs: number;
  /** 锚点毫秒，用于对齐触发时刻；缺省取 now */
  anchorMs?: number;
}

/** cron 调度：标准 cron 表达式 */
export interface CronExprSchedule {
  kind: "cron";
  /** cron 表达式 */
  expr: string;
  /** 时区，默认取宿主时区 */
  tz?: string;
  /** 错峰毫秒（参与规范化但不影响 nextRun 计算） */
  staggerMs?: number;
}

/** 规范化后的调度对象 */
export type CronSchedule = AtSchedule | EverySchedule | CronExprSchedule;

/** 松散的调度输入（来自用户配置），允许字段缺失，由 parseScheduleType 推断 */
export type CronScheduleInput = {
  kind?: string;
  at?: string | number;
  everyMs?: number;
  anchorMs?: number;
  expr?: string;
  tz?: string;
  staggerMs?: number;
};

/** Croner 表达式缓存上限 */
const CRON_EVAL_CACHE_MAX = 512;
const cronEvalCache = new Map<string, Cron>();

/** 规范化可选字符串：非字符串或空白返回空串 */
function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 解析时区：显式 tz 优先，否则取宿主时区 */
function resolveCronTimezone(tz?: string): string {
  const trimmed = normalizeOptionalString(tz);
  if (trimmed) {
    return trimmed;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** 把有限数从 unknown 中解析出来 */
function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** 获取（或创建）缓存的 Croner 实例，按 LRU 策略维护 */
function resolveCachedCron(expr: string, timezone: string): Cron {
  const key = `${timezone}\u0000${expr}`;
  const cached = cronEvalCache.get(key);
  if (cached) {
    // 命中时先删除再插入，使其移动到 Map 迭代序末尾，实现 LRU 语义
    cronEvalCache.delete(key);
    cronEvalCache.set(key, cached);
    return cached;
  }
  if (cronEvalCache.size >= CRON_EVAL_CACHE_MAX) {
    // 表达式解析较重需要缓存，但 cron 任务可被动态编辑，缓存需有界且 LRU
    const oldest = cronEvalCache.keys().next().value;
    if (oldest) {
      cronEvalCache.delete(oldest);
    }
  }
  const next = new Cron(expr, { timezone, catch: false });
  cronEvalCache.set(key, next);
  return next;
}

/** 从调度配置解析 Croner 实例 */
function resolveCronFromSchedule(schedule: { tz?: string; expr?: unknown }): Cron | undefined {
  if (typeof schedule.expr !== "string") {
    throw new Error("invalid cron schedule: expr is required");
  }
  const expr = schedule.expr.trim();
  if (!expr) {
    return undefined;
  }
  return resolveCachedCron(expr, resolveCronTimezone(schedule.tz));
}

/**
 * 解析调度类型
 * - 显式 kind 优先（at/every/cron，大小写不敏感）
 * - 否则按字段推断：有 at → at；有 everyMs → every；有 expr → cron
 * @returns 调度类型，无法推断时返回 undefined
 */
export function parseScheduleType(schedule: CronScheduleInput | Record<string, unknown>): ScheduleType | undefined {
  const rawKind = normalizeOptionalString(schedule.kind).toLowerCase();
  if (rawKind === "at" || rawKind === "every" || rawKind === "cron") {
    return rawKind;
  }
  if (schedule.at !== undefined && schedule.at !== null && schedule.at !== "") {
    return "at";
  }
  if (coerceFiniteNumber(schedule.everyMs) !== undefined) {
    return "every";
  }
  if (typeof schedule.expr === "string" && schedule.expr.trim()) {
    return "cron";
  }
  return undefined;
}

/**
 * 计算下次运行时间（毫秒）
 * @param schedule 调度配置（松散输入）
 * @param nowMs 当前时间（毫秒）
 * @returns 下次运行时间戳，或 undefined（不再触发）
 */
export function scheduleNextRun(
  schedule: CronScheduleInput | Record<string, unknown>,
  nowMs: number,
): number | undefined {
  const kind = parseScheduleType(schedule);

  if (kind === "at") {
    const atMs = parseAbsoluteTime(schedule.at as string | number);
    if (atMs === null) {
      return undefined;
    }
    return atMs > nowMs ? atMs : undefined;
  }

  if (kind === "every") {
    const everyMsRaw = coerceFiniteNumber(schedule.everyMs);
    if (everyMsRaw === undefined) {
      return undefined;
    }
    const everyMs = Math.max(1, Math.floor(everyMsRaw));
    const anchorRaw = coerceFiniteNumber(schedule.anchorMs);
    const anchor = Math.max(0, Math.floor(anchorRaw ?? nowMs));
    if (nowMs < anchor) {
      return anchor;
    }
    const elapsed = nowMs - anchor;
    const steps = Math.floor(elapsed / everyMs) + 1;
    return anchor + steps * everyMs;
  }

  if (kind === "cron") {
    const cron = resolveCronFromSchedule(schedule as { tz?: string; expr?: unknown });
    if (!cron) {
      return undefined;
    }
    const next = cron.nextRun(new Date(nowMs));
    if (!next) {
      return undefined;
    }
    const nextMs = next.getTime();
    if (!Number.isFinite(nextMs)) {
      return undefined;
    }

    // 规避 croner 年份回滚 bug：某些 时区/日期 组合（如 Asia/Shanghai）
    // 会让 nextRun 返回过去年份的时间戳。当返回值不在未来时，从更晚的参考点重试。
    if (nextMs <= nowMs) {
      const nextSecondMs = Math.floor(nowMs / 1000) * 1000 + 1000;
      const retry = cron.nextRun(new Date(nextSecondMs));
      if (retry) {
        const retryMs = retry.getTime();
        if (Number.isFinite(retryMs) && retryMs > nowMs) {
          return retryMs;
        }
      }
      // 仍在过去 → 从明日 UTC 0 点做更宽的重试
      const tomorrowMs = new Date(nowMs).setUTCHours(24, 0, 0, 0);
      const retry2 = cron.nextRun(new Date(tomorrowMs));
      if (retry2) {
        const retry2Ms = retry2.getTime();
        if (Number.isFinite(retry2Ms) && retry2Ms > nowMs) {
          return retry2Ms;
        }
      }
      return undefined;
    }

    return nextMs;
  }

  return undefined;
}

/**
 * 计算 cron 表达式的上一次运行时间（仅 cron 类型有效）
 * @param schedule 调度配置
 * @param nowMs 当前时间（毫秒）
 * @returns 上一次运行时间戳，或 undefined
 */
export function computePreviousRunAtMs(
  schedule: CronScheduleInput | Record<string, unknown>,
  nowMs: number,
): number | undefined {
  if (parseScheduleType(schedule) !== "cron") {
    return undefined;
  }
  const cron = resolveCronFromSchedule(schedule as { tz?: string; expr?: unknown });
  if (!cron) {
    return undefined;
  }
  const previousRuns = cron.previousRuns(1, new Date(nowMs));
  const previous = previousRuns[0];
  if (!previous) {
    return undefined;
  }
  const previousMs = previous.getTime();
  if (!Number.isFinite(previousMs) || previousMs >= nowMs) {
    return undefined;
  }
  return previousMs;
}

/** 清空 Croner 表达式缓存（用于确定性测试） */
export function clearCronScheduleCacheForTest(): void {
  cronEvalCache.clear();
}

/** 获取 Croner 表达式缓存当前大小（用于测试） */
export function getCronScheduleCacheSizeForTest(): number {
  return cronEvalCache.size;
}

/** 获取 Croner 表达式缓存容量上限（用于测试） */
export function getCronScheduleCacheMaxForTest(): number {
  return CRON_EVAL_CACHE_MAX;
}

/** 判断某 expr/tz 是否已进入缓存（用于测试） */
export function hasCronInCacheForTest(expr: string, tz: string): boolean {
  return cronEvalCache.has(`${tz}\u0000${expr}`);
}
