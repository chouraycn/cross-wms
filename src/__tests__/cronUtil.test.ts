/**
 * cronUtil 单元测试
 */

import { describe, it, expect } from 'vitest';
import { isValidCron, parseCron, describeCron, estimateNextRun } from '../services/cronUtil';

describe('cronUtil', () => {
  describe('isValidCron', () => {
    it('接受 5 段标准 cron', () => {
      expect(isValidCron('0 9 * * *')).toBe(true);
      expect(isValidCron('*/15 * * * *')).toBe(true);
      expect(isValidCron('0 0 1 1 0')).toBe(true);
    });

    it('拒绝非 5 段', () => {
      expect(isValidCron('0 9 *')).toBe(false);
      expect(isValidCron('0 9 * * * *')).toBe(false);
      expect(isValidCron('')).toBe(false);
    });
  });

  describe('parseCron', () => {
    it('正确解析 5 段', () => {
      const p = parseCron('0 9 * * *');
      expect(p).toEqual({ minute: '0', hour: '9', dayOfMonth: '*', month: '*', dayOfWeek: '*' });
    });

    it('对非法输入返回 null', () => {
      expect(parseCron('invalid')).toBeNull();
    });
  });

  describe('describeCron', () => {
    it('每分钟执行', () => {
      expect(describeCron('* * * * *')).toContain('每分钟');
    });

    it('每小时第 N 分', () => {
      expect(describeCron('15 * * * *')).toContain('每小时');
      expect(describeCron('15 * * * *')).toContain('15');
    });

    it('每天 HH:MM', () => {
      const s = describeCron('30 9 * * *');
      expect(s).toContain('9:30');
    });

    it('指定星期', () => {
      const s = describeCron('0 9 * * 1');
      expect(s).toContain('周一');
    });

    it('非法返回中文提示', () => {
      expect(describeCron('xx')).toContain('无效');
    });
  });

  describe('estimateNextRun', () => {
    it('有效 cron 返回 Date', () => {
      const d = estimateNextRun('0 9 * * *');
      expect(d).toBeInstanceOf(Date);
    });

    it('非法 cron 返回 null', () => {
      expect(estimateNextRun('xx')).toBeNull();
    });

    it('通配符分钟/小时时返回 null（交给后端）', () => {
      expect(estimateNextRun('* * * * *')).toBeNull();
      expect(estimateNextRun('0 * * * *')).toBeNull();
    });
  });
});
