/**
 * 日期时间格式化工具
 *
 * 提供日期时间的格式化、解析、ISO 转换与相对时间计算，
 * 基于 JavaScript 内置 Date 与 Intl API，不引入额外依赖。
 *
 * 参考自 openclaw/src/agents/date-time.ts。
 */
import { logger } from '../../logger.js';

/** 支持的输入类型：Date 实例、时间戳数字或时间字符串。 */
export type DateTimeInput = Date | number | string;

/** 默认格式化模板。 */
const DEFAULT_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/** 将输入转换为 Date 对象。 */
function toDate(input: DateTimeInput): Date {
  if (input instanceof Date) {
    return input;
  }
  if (typeof input === 'number') {
    return new Date(input);
  }
  if (typeof input === 'string') {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string: ${input}`);
    }
    return parsed;
  }
  throw new Error(`Unsupported date input type: ${typeof input}`);
}

/**
 * 格式化日期时间。
 *
 * 支持的占位符（区分大小写）：
 *   YYYY - 4 位年份
 *   MM   - 2 位月份（01-12）
 *   DD   - 2 位日期（01-31）
 *   HH   - 2 位小时（00-23，24 小时制）
 *   mm   - 2 位分钟（00-59）
 *   ss   - 2 位秒（00-59）
 *   SSS  - 3 位毫秒（000-999）
 *
 * 当指定 timezone 时，使用 Intl.DateTimeFormat 进行时区转换；
 * 未指定时使用本地时区。
 *
 * @param date 输入日期
 * @param format 格式化模板，默认 'YYYY-MM-DD HH:mm:ss'
 * @param timezone IANA 时区标识（如 'Asia/Shanghai'），可选
 */
export function formatDateTime(
  date: DateTimeInput,
  format?: string,
  timezone?: string,
): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date.');
  }
  const template = format && format.length > 0 ? format : DEFAULT_FORMAT;

  if (timezone) {
    return formatWithTimezone(d, template, timezone);
  }

  return applyFormat(d, template, () => ({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
    ms: d.getMilliseconds(),
  }));
}

/** 使用 Intl.DateTimeFormat 按指定时区格式化。 */
function formatWithTimezone(date: Date, format: string, timezone: string): string {
  // 通过 Intl 获取目标时区下的各分量，再套用模板
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      const value = parseInt(part.value, 10);
      if (!Number.isNaN(value)) {
        map[part.type] = value;
      }
    }
  }

  // hour 在 Intl 中可能是 "24"，规范化为 0
  const hours = map.hour === 24 ? 0 : (map.hour ?? 0);

  return applyFormat(date, format, () => ({
    year: map.year ?? date.getFullYear(),
    month: map.month ?? date.getMonth() + 1,
    day: map.day ?? date.getDate(),
    hours,
    minutes: map.minute ?? date.getMinutes(),
    seconds: map.second ?? date.getSeconds(),
    ms: date.getMilliseconds(),
  }));
}

/** 按模板应用日期分量。 */
function applyFormat(
  date: Date,
  format: string,
  resolve: () => {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    ms: number;
  },
): string {
  const parts = resolve();
  // 注意：替换顺序很重要，先替换长占位符避免前缀冲突
  return format
    .replace(/YYYY/g, String(parts.year).padStart(4, '0'))
    .replace(/SSS/g, String(parts.ms).padStart(3, '0'))
    .replace(/MM/g, String(parts.month).padStart(2, '0'))
    .replace(/DD/g, String(parts.day).padStart(2, '0'))
    .replace(/HH/g, String(parts.hours).padStart(2, '0'))
    .replace(/mm/g, String(parts.minutes).padStart(2, '0'))
    .replace(/ss/g, String(parts.seconds).padStart(2, '0'));
}

/**
 * 解析日期时间字符串。
 *
 * 优先尝试 ISO 8601 与 RFC 2822 解析；失败时按指定模板解析。
 * timezone 用于将解析结果调整为目标时区（仅影响显示，时间戳仍基于 UTC）。
 *
 * @param input 日期时间字符串
 * @param timezone IANA 时区标识（可选，目前仅做校验）
 */
export function parseDateTime(input: string, timezone?: string): Date {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('parseDateTime requires a non-empty input string.');
  }
  if (timezone) {
    // 校验时区是否合法；非法时区会抛出 RangeError
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
  }
  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  // 尝试按默认模板 YYYY-MM-DD HH:mm:ss 解析
  const fallback = parseWithFormat(input, DEFAULT_FORMAT);
  if (fallback) {
    return fallback;
  }
  throw new Error(`Unable to parse date string: ${input}`);
}

/** 按指定模板解析字符串，返回 Date 或 undefined。 */
function parseWithFormat(input: string, format: string): Date | undefined {
  // 将模板转为捕获正则
  const reSource = format
    .replace(/YYYY/g, '(\\d{4})')
    .replace(/SSS/g, '(\\d{3})')
    .replace(/MM/g, '(\\d{2})')
    .replace(/DD/g, '(\\d{2})')
    .replace(/HH/g, '(\\d{2})')
    .replace(/mm/g, '(\\d{2})')
    .replace(/ss/g, '(\\d{2})');
  const re = new RegExp(`^${reSource}$`);
  const match = re.exec(input);
  if (!match) {
    return undefined;
  }
  // 根据模板中各占位符出现的位置提取对应值
  const order: Array<'YYYY' | 'MM' | 'DD' | 'HH' | 'mm' | 'ss' | 'SSS'> = [];
  const placeholderRe = /YYYY|SSS|MM|DD|HH|mm|ss/g;
  let m: RegExpExecArray | null;
  while ((m = placeholderRe.exec(format)) !== null) {
    order.push(m[0] as 'YYYY' | 'MM' | 'DD' | 'HH' | 'mm' | 'ss' | 'SSS');
  }
  const values: Record<string, number> = {};
  for (let i = 0; i < order.length; i += 1) {
    values[order[i]] = parseInt(match[i + 1], 10);
  }
  const year = values.YYYY ?? 1970;
  const month = (values.MM ?? 1) - 1;
  const day = values.DD ?? 1;
  const hours = values.HH ?? 0;
  const minutes = values.mm ?? 0;
  const seconds = values.ss ?? 0;
  const ms = values.SSS ?? 0;
  const d = new Date(year, month, day, hours, minutes, seconds, ms);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * 将日期转换为 ISO 8601 字符串（如 '2024-01-01T00:00:00.000Z'）。
 * @param date 输入日期
 */
export function toISO(date: DateTimeInput): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date.');
  }
  return d.toISOString();
}

/**
 * 计算相对时间描述（如 "3 分钟前"、"2 小时后"）。
 *
 * 当输入时间早于当前时间，返回 "...前"；晚于当前时间，返回 "...后"；
 * 差值小于 1 分钟时返回 "刚刚"。
 *
 * @param date 输入日期
 */
export function fromNow(date: DateTimeInput): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date.');
  }
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const absDiff = Math.abs(diffMs);

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const suffix = diffMs < 0 ? '前' : '后';

  if (absDiff < 60 * 1000) {
    return '刚刚';
  }
  if (minutes < 60) {
    return `${minutes} 分钟${suffix}`;
  }
  if (hours < 24) {
    return `${hours} 小时${suffix}`;
  }
  if (days < 30) {
    return `${days} 天${suffix}`;
  }
  if (months < 12) {
    return `${months} 个月${suffix}`;
  }
  return `${years} 年${suffix}`;
}

logger.debug('[Agents:DateTime] Module loaded');
