/**
 * flows/types.ts 工具函数测试
 */

import { describe, it, expect } from 'vitest';
import {
  HEALTH_FINDING_SEVERITY_RANK,
  parseHealthFindingSeverity,
  healthFindingMeetsSeverity,
  sortFlowContributionsByLabel,
} from '../types.js';
import type {
  HealthFindingSeverity,
  HealthFinding,
  FlowContribution,
  FlowOption,
} from '../types.js';

describe('types 工具函数', () => {
  describe('HEALTH_FINDING_SEVERITY_RANK', () => {
    it('包含 3 个严重级别', () => {
      expect(Object.keys(HEALTH_FINDING_SEVERITY_RANK)).toHaveLength(3);
    });

    it('error > warning > info', () => {
      expect(HEALTH_FINDING_SEVERITY_RANK.error).toBeGreaterThan(
        HEALTH_FINDING_SEVERITY_RANK.warning,
      );
      expect(HEALTH_FINDING_SEVERITY_RANK.warning).toBeGreaterThan(
        HEALTH_FINDING_SEVERITY_RANK.info,
      );
    });
  });

  describe('parseHealthFindingSeverity', () => {
    it('解析合法的严重级别', () => {
      expect(parseHealthFindingSeverity('error')).toBe('error');
      expect(parseHealthFindingSeverity('warning')).toBe('warning');
      expect(parseHealthFindingSeverity('info')).toBe('info');
    });

    it('不合法的输入返回 null', () => {
      expect(parseHealthFindingSeverity(undefined)).toBeNull();
      expect(parseHealthFindingSeverity('invalid')).toBeNull();
      expect(parseHealthFindingSeverity('CRITICAL')).toBeNull();
    });
  });

  describe('healthFindingMeetsSeverity', () => {
    const makeFinding = (severity: HealthFindingSeverity): HealthFinding => ({
      checkId: 'test',
      severity,
      message: 'test',
    });

    it('error 级别满足所有严重级别', () => {
      const f = makeFinding('error');
      expect(healthFindingMeetsSeverity(f, 'error')).toBe(true);
      expect(healthFindingMeetsSeverity(f, 'warning')).toBe(true);
      expect(healthFindingMeetsSeverity(f, 'info')).toBe(true);
    });

    it('warning 级别不满足 error', () => {
      const f = makeFinding('warning');
      expect(healthFindingMeetsSeverity(f, 'error')).toBe(false);
      expect(healthFindingMeetsSeverity(f, 'warning')).toBe(true);
      expect(healthFindingMeetsSeverity(f, 'info')).toBe(true);
    });

    it('info 级别只满足 info', () => {
      const f = makeFinding('info');
      expect(healthFindingMeetsSeverity(f, 'error')).toBe(false);
      expect(healthFindingMeetsSeverity(f, 'warning')).toBe(false);
      expect(healthFindingMeetsSeverity(f, 'info')).toBe(true);
    });
  });

  describe('sortFlowContributionsByLabel', () => {
    const makeContrib = (label: string, value: string): FlowContribution => ({
      id: `id-${label}`,
      kind: 'provider',
      surface: 'model-picker',
      option: {
        value,
        label,
      },
    });

    it('按 option.label 字母顺序排序', () => {
      const contribs = [
        makeContrib('Zebra', 'z'),
        makeContrib('Apple', 'a'),
        makeContrib('Mango', 'm'),
      ];
      const sorted = sortFlowContributionsByLabel(contribs);
      expect(sorted.map((c) => c.option.label)).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('label 相同按 value 排序', () => {
      const contribs = [
        makeContrib('Same', 'b'),
        makeContrib('Same', 'a'),
        makeContrib('Same', 'c'),
      ];
      const sorted = sortFlowContributionsByLabel(contribs);
      expect(sorted.map((c) => c.option.value)).toEqual(['a', 'b', 'c']);
    });

    it('空数组返回空数组', () => {
      expect(sortFlowContributionsByLabel([])).toEqual([]);
    });

    it('不修改原数组', () => {
      const contribs = [makeContrib('B', 'b'), makeContrib('A', 'a')];
      const originalLabels = contribs.map((c) => c.option.label);
      sortFlowContributionsByLabel(contribs);
      expect(contribs.map((c) => c.option.label)).toEqual(originalLabels);
    });
  });
});
