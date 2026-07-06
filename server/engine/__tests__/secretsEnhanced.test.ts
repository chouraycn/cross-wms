/**
 * Secrets Enhanced 单元测试
 *
 * 覆盖 P2-7 密钥管理增强：
 * - exec provider（命令执行获取密钥 + 缓存）
 * - runtime snapshot（运行时快照）
 * - plan/apply（声明式变更计划）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveExecSecret,
  clearExecSecretCache,
  createSecretRuntimeSnapshot,
  planSecretChanges,
  applySecretPlan,
} from '../secretsEnhanced.js';
import type { SecretRef } from '../secretsTypes.js';

// mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock child_process exec — 使用 vi.hoisted 避免 hoisting 问题
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));
vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

describe('Secrets Enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExecSecretCache();
    mockExecAsync.mockReset();
  });

  describe('resolveExecSecret', () => {
    it('应能通过执行命令获取密钥值', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'secret-value-123\n', stderr: '' });

      const result = await resolveExecSecret({
        command: 'echo secret-value-123',
        timeoutMs: 5000,
      });

      expect(result).toBe('secret-value-123');
      expect(mockExecAsync).toHaveBeenCalledWith(
        'echo secret-value-123',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('应去除尾部换行符（trimOutput 默认 true）', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'value\n\n\n', stderr: '' });

      const result = await resolveExecSecret({ command: 'echo value' });
      expect(result).toBe('value');
    });

    it('应保留换行符当 trimOutput 为 false', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'value\n', stderr: '' });

      const result = await resolveExecSecret({
        command: 'echo value',
        trimOutput: false,
      });
      expect(result).toBe('value\n');
    });

    it('应使用缓存避免重复执行', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'cached-value', stderr: '' });

      const config = { command: 'echo cached-value' };
      const cacheKey = 'test-cache-key';

      const first = await resolveExecSecret(config, cacheKey);
      const second = await resolveExecSecret(config, cacheKey);

      expect(first).toBe('cached-value');
      expect(second).toBe('cached-value');
      expect(mockExecAsync).toHaveBeenCalledTimes(1);
    });

    it('命令执行失败时应抛出错误', async () => {
      mockExecAsync.mockRejectedValue(new Error('Command not found'));

      await expect(
        resolveExecSecret({ command: 'nonexistent-command-xyz' }),
      ).rejects.toThrow('Exec secret provider failed');
    });

    it('应支持自定义环境变量', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'env-value', stderr: '' });

      await resolveExecSecret({
        command: 'printenv MY_VAR',
        env: { MY_VAR: 'env-value' },
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        'printenv MY_VAR',
        expect.objectContaining({
          env: expect.objectContaining({ MY_VAR: 'env-value' }),
        }),
      );
    });
  });

  describe('clearExecSecretCache', () => {
    it('应能清除指定缓存键', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'val', stderr: '' });

      await resolveExecSecret({ command: 'echo val' }, 'key1');
      clearExecSecretCache('key1');

      await resolveExecSecret({ command: 'echo val' }, 'key1');
      expect(mockExecAsync).toHaveBeenCalledTimes(2);
    });

    it('应能清除所有缓存', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'val', stderr: '' });

      await resolveExecSecret({ command: 'echo val' }, 'key1');
      await resolveExecSecret({ command: 'echo val' }, 'key2');
      clearExecSecretCache();

      await resolveExecSecret({ command: 'echo val' }, 'key1');
      await resolveExecSecret({ command: 'echo val' }, 'key2');
      expect(mockExecAsync).toHaveBeenCalledTimes(4);
    });
  });

  describe('createSecretRuntimeSnapshot', () => {
    it('应生成不含实际值的快照', () => {
      const ref1: SecretRef = { provider: 'env', key: 'API_KEY' };
      const ref2: SecretRef = { provider: 'file', key: 'TOKEN' };

      const secrets = new Map([
        ['API_KEY', { value: 'secret123', ref: ref1, cached: true, resolvedAt: Date.now() }],
        ['TOKEN', { value: 'tok456', ref: ref2, cached: false, error: undefined, resolvedAt: Date.now() }],
      ]);

      const snapshot = createSecretRuntimeSnapshot(secrets);

      expect(snapshot.secrets).toHaveLength(2);
      expect(snapshot.stats.total).toBe(2);
      expect(snapshot.stats.resolved).toBe(2);
      expect(snapshot.stats.cached).toBe(1);
      expect(snapshot.stats.byProvider.env).toBe(1);
      expect(snapshot.stats.byProvider.file).toBe(1);

      // 确保不暴露实际值
      const entry = snapshot.secrets[0];
      expect(entry.valueLength).toBe(9); // 'secret123'.length
      expect(entry).not.toHaveProperty('value');
    });

    it('应正确统计未解析的密钥', () => {
      const ref: SecretRef = { provider: 'env', key: 'FAIL_KEY' };
      const secrets = new Map([
        ['FAIL_KEY', { value: '', ref, cached: false, error: 'Not found' }],
      ]);

      const snapshot = createSecretRuntimeSnapshot(secrets);
      expect(snapshot.stats.unresolved).toBe(1);
      expect(snapshot.stats.resolved).toBe(0);
      expect(snapshot.secrets[0].error).toBe('Not found');
    });
  });

  describe('planSecretChanges', () => {
    it('应检测新增的密钥', () => {
      const desired = new Map([
        ['NEW_KEY', { provider: 'env' as const, value: 'new-val' }],
      ]);
      const current = new Map<string, { provider: 'env' | 'file' | 'encrypted' | 'keychain' | 'exec'; valueLength?: number }>();

      const plan = planSecretChanges(desired, current);

      expect(plan.summary.creates).toBe(1);
      expect(plan.summary.updates).toBe(0);
      expect(plan.summary.deletes).toBe(0);
      expect(plan.items[0].action).toBe('create');
      expect(plan.items[0].key).toBe('NEW_KEY');
    });

    it('应检测删除的密钥', () => {
      const desired = new Map<string, { provider: 'env' | 'file' | 'encrypted' | 'keychain' | 'exec'; value?: string }>();
      const current = new Map([
        ['OLD_KEY', { provider: 'env' as const, valueLength: 10 }],
      ]);

      const plan = planSecretChanges(desired, current);

      expect(plan.summary.deletes).toBe(1);
      expect(plan.hasDestructiveChanges).toBe(true);
      expect(plan.items[0].action).toBe('delete');
    });

    it('应检测 provider 变更', () => {
      const desired = new Map([
        ['KEY', { provider: 'file' as const, value: 'val' }],
      ]);
      const current = new Map([
        ['KEY', { provider: 'env' as const, valueLength: 3 }],
      ]);

      const plan = planSecretChanges(desired, current);

      expect(plan.summary.updates).toBe(1);
      expect(plan.items[0].action).toBe('update');
      expect(plan.items[0].description).toContain('env');
      expect(plan.items[0].description).toContain('file');
    });

    it('无变更时应返回空计划', () => {
      const desired = new Map([
        ['KEY', { provider: 'env' as const, value: 'val' }],
      ]);
      const current = new Map([
        ['KEY', { provider: 'env' as const, valueLength: 3 }],
      ]);

      const plan = planSecretChanges(desired, current);

      expect(plan.summary.total).toBe(0);
      expect(plan.hasDestructiveChanges).toBe(false);
    });
  });

  describe('applySecretPlan', () => {
    it('应能执行变更计划', async () => {
      const plan = {
        planId: 'test-plan',
        createdAt: Date.now(),
        items: [
          { action: 'create' as const, key: 'K1', provider: 'env' as const, newValue: 'v1' },
          { action: 'delete' as const, key: 'K2', provider: 'env' as const },
        ],
        summary: { creates: 1, updates: 0, deletes: 1, total: 2 },
        hasDestructiveChanges: true,
      };

      const executor = vi.fn().mockResolvedValue(undefined);
      const result = await applySecretPlan(plan, executor);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('执行失败时应记录错误但继续后续操作', async () => {
      const plan = {
        planId: 'test-plan-fail',
        createdAt: Date.now(),
        items: [
          { action: 'create' as const, key: 'K1', provider: 'env' as const, newValue: 'v1' },
          { action: 'create' as const, key: 'K2', provider: 'env' as const, newValue: 'v2' },
        ],
        summary: { creates: 2, updates: 0, deletes: 0, total: 2 },
        hasDestructiveChanges: false,
      };

      const executor = vi.fn()
        .mockRejectedValueOnce(new Error('Write failed'))
        .mockResolvedValueOnce(undefined);

      const result = await applySecretPlan(plan, executor);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Write failed');
      expect(result.results[1].success).toBe(true);
    });
  });
});
