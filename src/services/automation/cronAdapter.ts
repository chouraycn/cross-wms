/**
 * cronAdapter — 在 RFC 5545 RRULE 与 5 段 cron 表达式之间互转。
 *
 * 背景：
 * - 后端 automation.rrule 字段存储的是 RRULE 字符串（如 FREQ=DAILY;BYHOUR=9;BYMINUTE=0），
 *   前端调度引擎（computeNextRun / formatScheduleLabel）只解析 RRULE。
 * - AutomationPanel 内的 CronBuilder 产出的是标准 5 段 cron（如 0 9 * * *）。
 *
 * 为了让 CronBuilder 能可视化编辑 rrule，二者需要做双向转换；
 * 存储时一律转回 RRULE，保证既有数据与前端引擎行为不变。
 *
 * 仅覆盖 CronBuilder 实际支持的字段（分钟 / 小时 / 日期 / 月份 / 星期），
 * 其余 cron 高级语法在写回 RRULE 时退化为最接近的近似。
 */

/** RRULE 星期缩写 -> cron 数字（0=周日） */
const RRULE_WEEKDAY_TO_CRON: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/** cron 数字 -> RRULE 星期缩写 */
const CRON_WEEKDAY_TO_RRULE: Record<number, string> = {
  0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
};

/** 判断字符串是否为合法 5 段 cron */
export function isCronExpression(value: string): boolean {
  return value.trim().split(/\s+/).length === 5;
}

/**
 * RFC 5545 RRULE -> 5 段 cron
 * 若传入非法/非 RRULE 字符串，尽量原样返回或回退到默认 daily@09:00。
 */
export function rruleToCron(rrule: string): string {
  if (!rrule || !rrule.includes('FREQ=')) {
    return isCronExpression(rrule) ? rrule.trim() : '0 9 * * *';
  }

  const parts = Object.fromEntries(
    rrule.split(';').map((p) => p.split('=')),
  );
  const freq = String(parts.FREQ || 'DAILY').toUpperCase();
  const hour = parts.BYHOUR ?? '9';
  const minute = parts.BYMINUTE ?? '0';
  const day = String(parts.BYDAY || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  if (freq === 'HOURLY') {
    return `${minute} * * * *`;
  }
  if (freq === 'WEEKLY') {
    const dow = day.length
      ? day
          .map((d) => RRULE_WEEKDAY_TO_CRON[d])
          .filter((v): v is number => v !== undefined)
          .join(',')
      : '*';
    return `${minute} ${hour} * * ${dow}`;
  }
  if (freq === 'MONTHLY') {
    return `${minute} ${hour} 1 * *`;
  }
  // DAILY 及其它
  return `${minute} ${hour} * * *`;
}

/**
 * 5 段 cron -> RFC 5545 RRULE
 * 无法判断频率时返回空串（调用方据此回退）。
 */
export function cronToRrule(cron: string): string {
  const p = (cron || '').trim().split(/\s+/);
  if (p.length !== 5) return '';

  const [minute, hour, dom, , dow] = p;

  // 每小时（小时为 *）
  if (hour === '*') {
    const m = minute === '*' ? 0 : parseInt(minute, 10) || 0;
    return `FREQ=HOURLY;BYHOUR=0;BYMINUTE=${m}`;
  }
  // 按月（指定日期）
  if (dom !== '*') {
    return `FREQ=MONTHLY;BYHOUR=${hour};BYMINUTE=${minute}`;
  }
  // 按星期
  if (dow !== '*') {
    const byday = dow
      .split(',')
      .map((n) => CRON_WEEKDAY_TO_RRULE[parseInt(n, 10)])
      .filter(Boolean)
      .join(',');
    return `FREQ=WEEKLY;BYHOUR=${hour};BYMINUTE=${minute};BYDAY=${byday}`;
  }
  // 每日
  return `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute}`;
}
