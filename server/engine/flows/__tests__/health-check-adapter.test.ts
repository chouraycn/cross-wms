/**
 * 健康检查适配器测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  defineSplitHealthCheck,
  normalizeHealthCheck,
  normalizeHealthChecks,
} from '../health-check-adapter.js';
import type { HealthCheck, HealthCheckRunContext, HealthFinding } from '../types.js';

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

describe('health-check-adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('defineSplitHealthCheck', () => {
    it('将分离式检查包装为支持 run 的形式', () => {
      const findings: HealthFinding[] = [
        { checkId: 'test', severity: 'info', message: 'test finding' },
      ];
      const check: HealthCheck = {
        id: 'test/split',
        kind: 'core',
        description: '测试分离式检查',
        async detect() {
          return findings;
        },
      };
      const wrapped = defineSplitHealthCheck(check);
      expect(wrapped.id).toBe('test/split');
      expect(wrapped.sourceContract).toBe('split');
      expect(typeof wrapped.detect).toBe('function');
      expect(typeof wrapped.run).toBe('function');
    });

    it('run 方法在无 findings 时仅返回 detect 结果', async () => {
      const check: HealthCheck = {
        id: 'test/no-findings',
        kind: 'core',
        description: '无 findings 检查',
        async detect() {
          return [];
        },
        async repair() {
          return { changes: ['should not be called'] };
        },
      };
      const wrapped = defineSplitHealthCheck(check);
      const ctx: HealthCheckRunContext = {
        mode: 'doctor',
        runtime: { cwd: '/test' },
        cfg: {},
        repair: true,
      };
      const result = await wrapped.run(ctx);
      expect(result.findings).toEqual([]);
      expect(result.changes).toBeUndefined();
    });

    it('run 方法在 repair=true 时执行修复', async () => {
      const findings: HealthFinding[] = [
        { checkId: 'test', severity: 'warning', message: '需要修复' },
      ];
      const check: HealthCheck = {
        id: 'test/with-repair',
        kind: 'core',
        description: '带修复的检查',
        async detect() {
          return findings;
        },
        async repair() {
          return {
            status: 'repaired',
            changes: ['已修复问题'],
          };
        },
      };
      const wrapped = defineSplitHealthCheck(check);
      const ctx: HealthCheckRunContext = {
        mode: 'doctor',
        runtime: { cwd: '/test' },
        cfg: {},
        repair: true,
      };
      const result = await wrapped.run(ctx);
      expect(result.findings).toHaveLength(1);
      expect(result.status).toBe('repaired');
      expect(result.changes).toEqual(['已修复问题']);
    });

    it('run 方法在 repair=false 且 previewRepair=false 时不执行修复', async () => {
      const findings: HealthFinding[] = [
        { checkId: 'test', severity: 'warning', message: '需要修复' },
      ];
      const repairSpy = vi.fn().mockResolvedValue({ changes: ['修复'] });
      const check: HealthCheck = {
        id: 'test/no-repair-mode',
        kind: 'core',
        description: '不修复',
        async detect() {
          return findings;
        },
        repair: repairSpy,
      };
      const wrapped = defineSplitHealthCheck(check);
      const ctx: HealthCheckRunContext = {
        mode: 'lint',
        runtime: { cwd: '/test' },
        cfg: {},
        repair: false,
      };
      const result = await wrapped.run(ctx);
      expect(result.findings).toHaveLength(1);
      expect(repairSpy).not.toHaveBeenCalled();
      expect(result.status).toBeUndefined();
    });
  });

  describe('normalizeHealthCheck', () => {
    it('分离式检查（只有 detect）正确规范化', () => {
      const check: HealthCheck = {
        id: 'test/split-only',
        kind: 'core',
        description: '只有 detect',
        async detect() {
          return [];
        },
      };
      const normalized = normalizeHealthCheck(check);
      expect(normalized.sourceContract).toBe('split');
      expect(typeof normalized.run).toBe('function');
    });

    it('自带 run 方法的检查正确规范化', () => {
      const runnableCheck = {
        id: 'test/runnable',
        kind: 'core' as const,
        description: '自带 run',
        async run() {
          return { findings: [] };
        },
      };
      const normalized = normalizeHealthCheck(runnableCheck);
      expect(normalized.sourceContract).toBe('run');
      expect(typeof normalized.detect).toBe('function');
      expect(typeof normalized.run).toBe('function');
    });

    it('已经规范化的检查直接返回', () => {
      const alreadyNormalized = {
        id: 'test/already',
        kind: 'core' as const,
        description: '已规范化',
        sourceContract: 'split' as const,
        async detect() {
          return [];
        },
        async run() {
          return { findings: [] };
        },
      };
      const result = normalizeHealthCheck(alreadyNormalized);
      expect(result).toBe(alreadyNormalized);
    });

    it('既没有 detect 也没有 run 时抛出错误', () => {
      const badCheck = {
        id: 'test/bad',
        kind: 'core' as const,
        description: '坏的检查',
      };
      expect(() => normalizeHealthCheck(badCheck as never)).toThrow(/必须定义 run\(\) 或 detect\(\)/);
    });
  });

  describe('normalizeHealthChecks', () => {
    it('批量规范化检查列表', () => {
      const checks = [
        {
          id: 'test/1',
          kind: 'core' as const,
          description: '检查1',
          async detect() {
            return [];
          },
        },
        {
          id: 'test/2',
          kind: 'plugin' as const,
          description: '检查2',
          async detect() {
            return [];
          },
        },
      ];
      const normalized = normalizeHealthChecks(checks);
      expect(normalized).toHaveLength(2);
      expect(normalized[0].sourceContract).toBe('split');
      expect(normalized[1].sourceContract).toBe('split');
    });
  });
});
