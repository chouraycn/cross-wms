/**
 * doctor-lint-flow 和 doctor-repair-flow 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exitCodeFromFindings,
  countFindingsBySeverity,
  formatLintResult,
} from '../doctor-lint-flow.js';
import { formatRepairResult } from '../doctor-repair-flow.js';
import type { HealthFinding, DoctorLintRunResult, DoctorRepairRunResult } from '../types.js';

const { loggerMock } = vi.hoisted(() => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMock };
});

vi.mock('../../../logger.js', () => ({ logger: loggerMock }));

describe('doctor-lint-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('countFindingsBySeverity', () => {
    it('按严重级别统计数量', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'error', message: 'e1' },
        { checkId: 'a', severity: 'error', message: 'e2' },
        { checkId: 'b', severity: 'warning', message: 'w1' },
        { checkId: 'b', severity: 'warning', message: 'w2' },
        { checkId: 'b', severity: 'warning', message: 'w3' },
        { checkId: 'c', severity: 'info', message: 'i1' },
      ];
      const counts = countFindingsBySeverity(findings);
      expect(counts.error).toBe(2);
      expect(counts.warning).toBe(3);
      expect(counts.info).toBe(1);
    });

    it('空数组返回全 0', () => {
      const counts = countFindingsBySeverity([]);
      expect(counts.error).toBe(0);
      expect(counts.warning).toBe(0);
      expect(counts.info).toBe(0);
    });
  });

  describe('exitCodeFromFindings', () => {
    it('有 error 时退出码为 1（默认阈值 warning）', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'error', message: 'err' },
      ];
      expect(exitCodeFromFindings(findings)).toBe(1);
    });

    it('只有 warning 时退出码为 1（默认阈值 warning）', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'warning', message: 'warn' },
      ];
      expect(exitCodeFromFindings(findings)).toBe(1);
    });

    it('只有 info 时退出码为 0（默认阈值 warning）', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'info', message: 'info' },
      ];
      expect(exitCodeFromFindings(findings)).toBe(0);
    });

    it('空 findings 退出码为 0', () => {
      expect(exitCodeFromFindings([])).toBe(0);
    });

    it('尊重 severityThreshold', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'warning', message: 'warn' },
      ];
      expect(exitCodeFromFindings(findings, 'error')).toBe(0);
      expect(exitCodeFromFindings(findings, 'warning')).toBe(1);
      expect(exitCodeFromFindings(findings, 'info')).toBe(1);
    });
  });

  describe('formatLintResult', () => {
    it('格式化 lint 结果为可读字符串', () => {
      const result = {
        findings: [
          { checkId: 'test/a', severity: 'error', message: '严重错误' },
          { checkId: 'test/b', severity: 'warning', message: '警告' },
        ],
        totalChecks: 10,
        okChecks: 8,
        findingChecks: 2,
        errorChecks: 0,
        durationMs: 100,
      } as unknown as DoctorLintRunResult;
      const formatted = formatLintResult(result);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('无 findings 时包含通过信息', () => {
      const result = {
        findings: [],
        totalChecks: 5,
        okChecks: 5,
        findingChecks: 0,
        errorChecks: 0,
        durationMs: 50,
      } as unknown as DoctorLintRunResult;
      const formatted = formatLintResult(result);
      expect(formatted).toContain('通过');
    });
  });
});

describe('doctor-repair-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatRepairResult', () => {
    it('格式化修复结果为可读字符串', () => {
      const result = {
        checksRun: 10,
        checksRepaired: 3,
        checksValidated: 10,
        changes: ['修复了配置文件', '更新了环境变量'],
        remainingFindings: [
          { checkId: 'test/b', severity: 'warning', message: '仍有警告' },
        ],
        warnings: ['部分修复需要手动确认'],
        effects: [{ kind: 'config', action: 'update', target: 'app.json' }],
      } as unknown as DoctorRepairRunResult;
      const formatted = formatRepairResult(result);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('修复摘要');
    });

    it('无变更时显示基本信息', () => {
      const result = {
        checksRun: 5,
        checksRepaired: 0,
        checksValidated: 5,
        changes: [],
        remainingFindings: [],
        warnings: [],
        effects: [],
      } as unknown as DoctorRepairRunResult;
      const formatted = formatRepairResult(result);
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('修复摘要');
    });
  });
});
