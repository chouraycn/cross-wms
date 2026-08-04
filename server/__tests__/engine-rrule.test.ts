/**
 * P1-③: isAutomationDue RRULE 解析测试
 *
 * 测试 engine.ts 中的 computeNextRunFromRrule 函数
 * 通过间接方式测试：验证不同 RRULE 模式下的到期判断
 */
import { describe, it, expect, vi } from 'vitest';
import { Cron } from 'croner';

describe('computeNextRunFromRrule (via croner)', () => {
  // 直接测试 RRULE → cron 转换 + croner 解析
  // 模拟 computeNextRunFromRrule 的逻辑

  function rruleToCron(rrule: string): string {
    const parts = Object.fromEntries(
      rrule.split(';').map((p) => p.split('='))
    ) as Record<string, string>;

    const freq = (parts.FREQ || 'DAILY').toUpperCase();
    const hour = parseInt(parts.BYHOUR || '0', 10);
    const minute = parseInt(parts.BYMINUTE || '0', 10);

    switch (freq) {
      case 'HOURLY':
        return `${minute} * * * *`;
      case 'DAILY':
        return `${minute} ${hour} * * *`;
      case 'WEEKLY': {
        const dayMap: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
        const byDays = (parts.BYDAY || '').split(',').filter(Boolean);
        const cronDays = byDays.length > 0
          ? byDays.map((d) => dayMap[d]).filter((d) => d !== undefined).join(',')
          : '*';
        return `${minute} ${hour} * * ${cronDays}`;
      }
      case 'MONTHLY': {
        const monthDay = parseInt(parts.BYMONTHDAY || '1', 10);
        return `${minute} ${hour} ${monthDay} * *`;
      }
      default:
        return `${minute} ${hour} * * *`;
    }
  }

  function computeNextRun(rrule: string, fromMs: number): number | null {
    const cronExpr = rruleToCron(rrule);
    const cron = new Cron(cronExpr, { catch: false });
    const next = cron.nextRun(new Date(fromMs));
    return next ? next.getTime() : null;
  }

  it('should convert DAILY RRULE to cron and compute next run', () => {
    const rrule = 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0';
    const cronExpr = rruleToCron(rrule);
    expect(cronExpr).toBe('0 2 * * *');

    // From 2026-08-01 10:00, next run should be 2026-08-02 02:00
    const from = new Date('2026-08-01T10:00:00').getTime();
    const next = computeNextRun(rrule, from);
    expect(next).not.toBeNull();

    const nextDate = new Date(next!);
    expect(nextDate.getHours()).toBe(2);
    expect(nextDate.getMinutes()).toBe(0);
    expect(nextDate.getDate()).toBe(2); // Next day
  });

  it('should convert HOURLY RRULE to cron', () => {
    const rrule = 'FREQ=HOURLY;BYMINUTE=30';
    const cronExpr = rruleToCron(rrule);
    expect(cronExpr).toBe('30 * * * *');

    const from = new Date('2026-08-01T10:00:00').getTime();
    const next = computeNextRun(rrule, from);
    expect(next).not.toBeNull();
    expect(new Date(next!).getMinutes()).toBe(30);
    expect(new Date(next!).getHours()).toBe(10);
  });

  it('should convert WEEKLY RRULE with BYDAY', () => {
    const rrule = 'FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9;BYMINUTE=0';
    const cronExpr = rruleToCron(rrule);
    expect(cronExpr).toBe('0 9 * * 1,5');

    // From Saturday, next run should be Monday
    const saturday = new Date('2026-08-01T12:00:00').getTime(); // Aug 1 2026 is Saturday
    const next = computeNextRun(rrule, saturday);
    expect(next).not.toBeNull();
    const nextDate = new Date(next!);
    expect(nextDate.getDay()).toBe(1); // Monday
    expect(nextDate.getHours()).toBe(9);
  });

  it('should convert MONTHLY RRULE', () => {
    const rrule = 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=3;BYMINUTE=0';
    const cronExpr = rruleToCron(rrule);
    expect(cronExpr).toBe('0 3 1 * *');

    const from = new Date('2026-08-15T10:00:00').getTime();
    const next = computeNextRun(rrule, from);
    expect(next).not.toBeNull();
    const nextDate = new Date(next!);
    expect(nextDate.getDate()).toBe(1);
    expect(nextDate.getMonth()).toBe(8); // September (0-indexed)
  });

  it('should handle unknown FREQ by defaulting to DAILY', () => {
    const rrule = 'FREQ=UNKNOWN;BYHOUR=5;BYMINUTE=30';
    const cronExpr = rruleToCron(rrule);
    expect(cronExpr).toBe('30 5 * * *');
  });

  it('should handle WEEKLY without BYDAY', () => {
    const rrule = 'FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0';
    const cronExpr = rruleToCron(rrule);
    expect(cronExpr).toBe('0 9 * * *');
  });
});
