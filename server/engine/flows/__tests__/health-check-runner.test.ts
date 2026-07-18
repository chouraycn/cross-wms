/**
 * 健康检查运行器测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createValidationScope,
  hasHealthRepairOutput,
  sortFindingsBySeverity,
  runSingleCheck,
  runChecks,
  runSingleCheckWithRepair,
  filterChecksByIds,
} from '../health-check-runner.js';
import type {
  HealthCheck,
  HealthCheckContext,
  HealthFinding,
  HealthRepairResult,
} from '../types.js';
import { HEALTH_FINDING_SEVERITY_RANK } from '../types.js';

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

describe('health-check-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sortFindingsBySeverity', () => {
    it('按严重级别降序排序', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'info', message: 'info' },
        { checkId: 'b', severity: 'error', message: 'error' },
        { checkId: 'c', severity: 'warning', message: 'warning' },
      ];
      const sorted = sortFindingsBySeverity(findings);
      expect(sorted.map((f) => f.severity)).toEqual(['error', 'warning', 'info']);
    });

    it('同级别按 checkId 升序排序', () => {
      const findings: HealthFinding[] = [
        { checkId: 'check-b', severity: 'warning', message: 'b' },
        { checkId: 'check-a', severity: 'warning', message: 'a' },
        { checkId: 'check-c', severity: 'warning', message: 'c' },
      ];
      const sorted = sortFindingsBySeverity(findings);
      expect(sorted.map((f) => f.checkId)).toEqual(['check-a', 'check-b', 'check-c']);
    });

    it('同级别同 checkId 按 path 升序排序', () => {
      const findings: HealthFinding[] = [
        { checkId: 'same', severity: 'warning', message: 'b', path: 'b.txt' },
        { checkId: 'same', severity: 'warning', message: 'a', path: 'a.txt' },
      ];
      const sorted = sortFindingsBySeverity(findings);
      expect(sorted.map((f) => f.path)).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('createValidationScope', () => {
    it('从 findings 中提取 path 和 ocPath', () => {
      const findings: HealthFinding[] = [
        { checkId: 'a', severity: 'warning', message: '1', path: 'file1.ts', ocPath: 'oc://a' },
        { checkId: 'b', severity: 'warning', message: '2', path: 'file2.ts' },
        { checkId: 'c', severity: 'warning', message: '3', path: 'file1.ts', ocPath: 'oc://a' },
      ];
      const scope = createValidationScope(findings);
      expect(scope.paths).toEqual(['file1.ts', 'file2.ts']);
      expect(scope.ocPaths).toEqual(['oc://a']);
      expect(scope.findings).toBe(findings);
    });

    it('空 findings 返回空 scope', () => {
      const scope = createValidationScope([]);
      expect(scope.paths).toEqual([]);
      expect(scope.ocPaths).toEqual([]);
    });
  });

  describe('hasHealthRepairOutput', () => {
    it('有 config 时返回 true', () => {
      expect(hasHealthRepairOutput({ config: {}, changes: [] })).toBe(true);
    });

    it('有 changes 时返回 true', () => {
      expect(hasHealthRepairOutput({ changes: ['test'] })).toBe(true);
    });

    it('有 diffs 时返回 true', () => {
      expect(hasHealthRepairOutput({ diffs: [{ kind: 'config', path: 'test' }] })).toBe(true);
    });

    it('有 effects 时返回 true', () => {
      expect(hasHealthRepairOutput({ effects: [{ kind: 'config', action: 'test' }] })).toBe(true);
    });

    it('什么都没有时返回 false', () => {
      expect(hasHealthRepairOutput({ changes: [] })).toBe(false);
      expect(hasHealthRepairOutput({})).toBe(false);
    });
  });

  describe('runSingleCheck', () => {
    const mockCtx: HealthCheckContext = {
      mode: 'doctor',
      runtime: { cwd: '/test' },
      cfg: {},
    };

    it('检查通过时返回 ok 状态', async () => {
      const check: HealthCheck = {
        id: 'test/ok',
        kind: 'core',
        description: '通过的检查',
        async detect() {
          return [];
        },
      };
      const result = await runSingleCheck(check, mockCtx);
      expect(result.status).toBe('ok');
      expect(result.findings).toEqual([]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('有 findings 时返回 findings 状态', async () => {
      const check: HealthCheck = {
        id: 'test/findings',
        kind: 'core',
        description: '有发现的检查',
        async detect() {
          return [{ checkId: 'test/findings', severity: 'warning', message: 'test' }];
        },
      };
      const result = await runSingleCheck(check, mockCtx);
      expect(result.status).toBe('findings');
      expect(result.findings).toHaveLength(1);
    });

    it('检查抛错时返回 error 状态', async () => {
      const check: HealthCheck = {
        id: 'test/error',
        kind: 'core',
        description: '抛错的检查',
        async detect() {
          throw new Error('检测失败');
        },
      };
      const result = await runSingleCheck(check, mockCtx);
      expect(result.status).toBe('error');
      expect(result.error).toContain('检测失败');
      expect(result.findings).toEqual([]);
    });
  });

  describe('runChecks', () => {
    const mockCtx: HealthCheckContext = {
      mode: 'doctor',
      runtime: { cwd: '/test' },
      cfg: {},
    };

    it('批量运行多个检查', async () => {
      const checks: HealthCheck[] = [
        {
          id: 'test/1',
          kind: 'core',
          description: '检查1',
          async detect() {
            return [];
          },
        },
        {
          id: 'test/2',
          kind: 'core',
          description: '检查2',
          async detect() {
            return [{ checkId: 'test/2', severity: 'info', message: 'hi' }];
          },
        },
      ];
      const summary = await runChecks(checks, mockCtx);
      expect(summary.totalChecks).toBe(2);
      expect(summary.okChecks).toBe(1);
      expect(summary.findingChecks).toBe(1);
      expect(summary.errorChecks).toBe(0);
      expect(summary.allFindings).toHaveLength(1);
    });

    it('单个检查失败不影响其他检查', async () => {
      const checks: HealthCheck[] = [
        {
          id: 'test/ok',
          kind: 'core',
          description: '通过',
          async detect() {
            return [];
          },
        },
        {
          id: 'test/throw',
          kind: 'core',
          description: '抛错',
          async detect() {
            throw new Error('boom');
          },
        },
      ];
      const summary = await runChecks(checks, mockCtx);
      expect(summary.totalChecks).toBe(2);
      expect(summary.errorChecks).toBe(1);
      expect(summary.okChecks).toBe(1);
    });
  });

  describe('filterChecksByIds', () => {
    const makeChecks = (): HealthCheck[] => [
      { id: 'a', kind: 'core', description: 'A', async detect() { return []; } },
      { id: 'b', kind: 'core', description: 'B', async detect() { return []; } },
      { id: 'c', kind: 'core', description: 'C', async detect() { return []; } },
    ];

    it('onlyIds 过滤', () => {
      const { selected, unknownOnlyIds } = filterChecksByIds(makeChecks(), { onlyIds: ['a', 'c'] });
      expect(selected.map((c) => c.id).sort()).toEqual(['a', 'c']);
      expect(unknownOnlyIds).toEqual([]);
    });

    it('skipIds 过滤', () => {
      const { selected } = filterChecksByIds(makeChecks(), { skipIds: ['b'] });
      expect(selected.map((c) => c.id).sort()).toEqual(['a', 'c']);
    });

    it('onlyIds 包含未知 id 时返回 unknownOnlyIds', () => {
      const { selected, unknownOnlyIds } = filterChecksByIds(makeChecks(), { onlyIds: ['a', 'z'] });
      expect(selected.map((c) => c.id)).toEqual(['a']);
      expect(unknownOnlyIds).toEqual(['z']);
    });

    it('支持 Set 类型输入', () => {
      const { selected } = filterChecksByIds(makeChecks(), { onlyIds: new Set(['a', 'b']) });
      expect(selected).toHaveLength(2);
    });
  });

  describe('runSingleCheckWithRepair', () => {
    it('无 repair 方法的检查只做 detect', async () => {
      const check: HealthCheck = {
        id: 'test/no-repair',
        kind: 'core',
        description: '无修复',
        async detect() {
          return [{ checkId: 'test', severity: 'warning', message: 'warn' }];
        },
      };
      const result = await runSingleCheckWithRepair(check, {
        mode: 'doctor',
        runtime: { cwd: '/test' },
        cfg: {},
        repair: true,
      });
      expect(result.status).toBe('findings');
      expect(result.repairResult).toBeUndefined();
    });

    it('dry-run 模式不持久化配置变更', async () => {
      const check: HealthCheck = {
        id: 'test/dryrun',
        kind: 'core',
        description: 'dry run',
        async detect() {
          return [{ checkId: 'test', severity: 'warning', message: 'need fix' }];
        },
        async repair(ctx): Promise<HealthRepairResult> {
          return {
            status: 'repaired',
            config: { repaired: true },
            changes: ['已修复'],
          };
        },
      };
      const result = await runSingleCheckWithRepair(check, {
        mode: 'doctor',
        runtime: { cwd: '/test' },
        cfg: {},
        repair: false,
        dryRun: true,
      });
      expect(result.status).toBe('findings');
      expect(result.repairResult?.changes).toEqual(['已修复']);
    });
  });
});
