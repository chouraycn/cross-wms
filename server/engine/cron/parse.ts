/**
 * 时间解析 - 严格校验 ISO 8601 绝对时间并规范化为 UTC
 *
 * 设计要点（对齐 openclaw/src/cron/parse.ts）：
 * - Date.parse 会把无效日历日期（如 02-31）回滚到下月，cron 调度必须在排程前拒绝这类输入
 * - 支持纯 epoch 毫秒数字（字符串或数字形式）
 * - 缺少时区的 ISO 字符串自动补 Z 后缀，规范化为 UTC
 */

/** 已带时区后缀（Z 或 ±HH:MM）的正则 */
const ISO_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
/** 纯日期形式 YYYY-MM-DD */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 日期时间形式 YYYY-MM-DDT... */
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T/;
/**
 * 绝对时间完整正则
 * 捕获组：year / month / day / hour / minute / second / fraction
 */
const ISO_ABSOLUTE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?$/;

/** 将缺少时区的 ISO 字符串补齐 Z 后缀以规范化为 UTC */
export function normalizeToUtc(raw: string): string {
  if (ISO_TZ_RE.test(raw)) {
    return raw;
  }
  if (ISO_DATE_RE.test(raw)) {
    return `${raw}T00:00:00Z`;
  }
  if (ISO_DATE_TIME_RE.test(raw)) {
    return `${raw}Z`;
  }
  return raw;
}

/**
 * 严格校验 ISO 绝对时间
 * 通过 setUTC* 回写后再读回，确保日期不会被 Date 静默回滚
 */
function isValidIsoAbsolute(raw: string): boolean {
  const match = ISO_ABSOLUTE_RE.exec(raw);
  if (!match) {
    return false;
  }

  const [
    ,
    yearRaw,
    monthRaw,
    dayRaw,
    hourRaw = "0",
    minuteRaw = "0",
    secondRaw = "0",
    fractionRaw,
  ] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const millisecond = fractionRaw ? Number(fractionRaw.slice(1, 4).padEnd(3, "0")) : 0;
  // 24:00:00 是合法的“一天结束”表达，等价于次日 00:00:00
  const isEndOfDay = hour === 24 && minute === 0 && second === 0 && millisecond === 0;

  // Date.parse 会回滚无效日历日期；cron 必须在调度前拒绝它们
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(isEndOfDay ? 0 : hour, minute, second, millisecond);

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    probe.getUTCHours() === (isEndOfDay ? 0 : hour) &&
    probe.getUTCMinutes() === minute &&
    probe.getUTCSeconds() === second &&
    probe.getUTCMilliseconds() === millisecond
  );
}

/** 判断字符串是否为合法的 ISO 8601 绝对时间 */
export function isValidIso8601(raw: unknown): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  // 纯数字串属于 epoch 表达，不归 ISO 8601 校验
  if (/^\d+$/.test(trimmed)) {
    return false;
  }
  return isValidIsoAbsolute(trimmed);
}

/**
 * 解析绝对时间戳
 * @param input ISO 8601 字符串，或 epoch 毫秒（数字 / 纯数字字符串）
 * @returns 毫秒时间戳，或 null（输入无效）
 */
export function parseAbsoluteTime(input: string | number): number | null {
  // 纯 epoch 毫秒数字
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return null;
    }
    const ms = Math.floor(input);
    return Number.isFinite(new Date(ms).getTime()) ? ms : null;
  }

  const raw = input.trim();
  if (!raw) {
    return null;
  }

  // 纯数字字符串按 epoch 毫秒处理
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isFinite(new Date(n).getTime())) {
      return n;
    }
    return null;
  }

  if (!isValidIsoAbsolute(raw)) {
    return null;
  }

  const parsed = Date.parse(normalizeToUtc(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

/** parseAbsoluteTime 的毫秒语义别名，便于按 epoch 语义调用 */
export function parseAbsoluteTimeMs(input: string | number): number | null {
  return parseAbsoluteTime(input);
}
