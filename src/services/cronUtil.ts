/**
 * 轻量级 cron 工具（前端）
 *
 * 后端 /api/cron/parse 已提供权威解析；此处只做：
 * - 校验 5 段 cron 表达式
 * - 解析出字段（minute / hour / dom / mon / dow）
 * - 生成「人类可读」描述
 * - 简单预测下次运行时间（粗略，不依赖后端时使用）
 *
 * 真实生产场景请优先调用后端 /api/cron/parse。
 */

const WEEKDAY_LABELS: Record<number, string> = {
  0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六',
};

/** 校验是否为 5 段 cron 表达式 */
export function isValidCron(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.trim().split(/\s+/).length === 5;
}

/** 解析 cron 字符串 */
export function parseCron(value: string): { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string } | null {
  if (!isValidCron(value)) return null;
  const [m, h, dom, mon, dow] = value.trim().split(/\s+/);
  return { minute: m, hour: h, dayOfMonth: dom, month: mon, dayOfWeek: dow };
}

/** 生成人类可读描述 */
export function describeCron(value: string): string {
  if (!isValidCron(value)) return '无效的 cron 表达式';
  const parts = parseCron(value);
  if (!parts) return '无效的 cron 表达式';
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parts;

  if (minute === '*' && hour === '*') return '每分钟执行';
  if (minute.startsWith('*/') && hour === '*') {
    const n = minute.slice(2);
    return `每 ${n} 分钟执行`;
  }
  if (minute !== '*' && hour === '*') {
    return `每小时第 ${minute} 分执行`;
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每天 ${hour}:${minute.padStart(2, '0')} 执行`;
  }
  if (minute !== '*' && hour !== '*' && dayOfWeek !== '*' && dayOfMonth === '*' && month === '*') {
    const days = dayOfWeek.split(',').map(d => WEEKDAY_LABELS[parseInt(d, 10)] ?? d).join('、');
    return `每${days} ${hour}:${minute.padStart(2, '0')} 执行`;
  }
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${hour}:${minute.padStart(2, '0')} 执行`;
  }
  return `自定义：${value}`;
}

/** 粗略估算「下次执行时间」（仅在字段简单时使用，不替代后端） */
export function estimateNextRun(value: string, fromMs: number = Date.now()): Date | null {
  if (!isValidCron(value)) return null;
  const parts = parseCron(value);
  if (!parts) return null;
  const { minute, hour } = parts;

  // 只支持 minute / hour 数字 + 通配
  const m = minute === '*' ? null : parseInt(minute, 10);
  const h = hour === '*' ? null : parseInt(hour, 10);
  if (m === null || h === null) return null; // 复杂表达式交给后端

  const next = new Date(fromMs);
  next.setSeconds(0, 0);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= fromMs) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}
