import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createCommitmentRuntime,
  addCommitment,
  getCommitment,
  loadCommitmentStore,
  resetCommitmentsFullChainForTests,
} from '../index.js';
import type { CommitmentScope } from '../index.js';

describe('runtime', () => {
  let testDir: string;
  let storePath: string;
  let testScope: CommitmentScope;

  beforeEach(async () => {
    testDir = join(tmpdir(), `commitments-runtime-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    storePath = join(testDir, 'commitments.json');
    testScope = {
      agentId: 'test-agent',
      sessionKey: 'test-session',
      channel: 'test-channel',
    };
    resetCommitmentsFullChainForTests();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('创建运行时', () => {
    it('应该创建运行时实例', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      expect(runtime).toBeDefined();
      expect(typeof runtime.enqueueExtraction).toBe('function');
      expect(typeof runtime.verifyAndComplete).toBe('function');
    });

    it('禁用时应该返回禁用配置', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: false } },
      });
      const config = runtime.getConfig();
      expect(config.enabled).toBe(false);
    });

    it('测试环境中默认禁用后台提取', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const config = runtime.getConfig();
      expect(config.enabled).toBe(true);
    });
  });

  describe('队列管理', () => {
    it('应该排队提取任务', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const result = runtime.enqueueExtraction({
        scope: testScope,
        itemId: 'item-1',
        userText: '我明天下午3点前完成这个任务',
        assistantText: '好的，我会提醒您',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
      });
      expect(result).toBe(true);
    });

    it('空用户文本不排队', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const result = runtime.enqueueExtraction({
        scope: testScope,
        itemId: 'item-1',
        userText: '',
        assistantText: '',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
      });
      expect(result).toBe(false);
    });

    it('缺少必要字段不排队', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const result = runtime.enqueueExtraction({
        scope: testScope,
        itemId: '',
        userText: 'test',
        assistantText: '',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
      });
      expect(result).toBe(false);
    });

    it('禁用时不排队', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: false } },
      });
      const result = runtime.enqueueExtraction({
        scope: testScope,
        itemId: 'item-1',
        userText: '我明天完成',
        assistantText: '',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
      });
      expect(result).toBe(false);
    });
  });

  describe('状态管理', () => {
    it('resetForTests 应该重置状态', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      runtime.enqueueExtraction({
        scope: testScope,
        itemId: 'item-1',
        userText: '我明天完成',
        assistantText: '',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
      });
      runtime.resetForTests();
      const stats = runtime.getStats();
      expect(stats.queueSize).toBe(0);
    });
  });

  describe('完成验证', () => {
    it('不存在的承诺应该返回失败', async () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const result = await runtime.verifyAndComplete({
        id: 'nonexistent-id',
        storePath,
      });
      expect(result.completed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('没有验证器时应该直接标记完成', async () => {
      const nowMs = Date.now();
      await addCommitment({
        id: 'test-complete-1',
        scope: testScope,
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '完成报告',
        suggestedText: '提醒完成报告',
        dedupeKey: 'deadline_check:完成报告',
        confidence: 0.8,
        dueWindow: {
          earliestMs: nowMs - 1000,
          latestMs: nowMs + 100000,
          timezone: 'Asia/Shanghai',
        },
        status: 'pending',
        createdAtMs: nowMs - 5000,
        updatedAtMs: nowMs - 5000,
        storePath,
      });

      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const result = await runtime.verifyAndComplete({
        id: 'test-complete-1',
        storePath,
        nowMs,
      });
      expect(result.completed).toBe(true);

      const updated = await getCommitment({ id: 'test-complete-1', storePath });
      expect(updated?.status).toBe('completed');
    });

    it('应该使用自定义验证器', async () => {
      const nowMs = Date.now();
      await addCommitment({
        id: 'test-complete-2',
        scope: testScope,
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '完成报告',
        suggestedText: '提醒完成报告',
        dedupeKey: 'deadline_check:完成报告',
        confidence: 0.8,
        dueWindow: {
          earliestMs: nowMs - 1000,
          latestMs: nowMs + 100000,
          timezone: 'Asia/Shanghai',
        },
        status: 'pending',
        createdAtMs: nowMs - 5000,
        updatedAtMs: nowMs - 5000,
        storePath,
      });

      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
        completionVerifier: async () => ({ completed: true, reason: 'custom-verified' }),
      });
      const result = await runtime.verifyAndComplete({
        id: 'test-complete-2',
        storePath,
        nowMs,
        context: { custom: true },
      });
      expect(result.completed).toBe(true);
      expect(result.reason).toBe('custom-verified');
    });
  });

  describe('状态快捷方法', () => {
    it('markSent 应该标记为已发送', async () => {
      const nowMs = Date.now();
      await addCommitment({
        id: 'test-sent-1',
        scope: testScope,
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '完成报告',
        suggestedText: '提醒完成报告',
        dedupeKey: 'deadline_check:完成报告',
        confidence: 0.8,
        dueWindow: {
          earliestMs: nowMs + 1000,
          latestMs: nowMs + 100000,
          timezone: 'Asia/Shanghai',
        },
        status: 'pending',
        createdAtMs: nowMs - 5000,
        updatedAtMs: nowMs - 5000,
        storePath,
      });

      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      await runtime.markSent('test-sent-1', { storePath, nowMs });

      const updated = await getCommitment({ id: 'test-sent-1', storePath });
      expect(updated?.status).toBe('sent');
    });

    it('markDismissed 应该标记为已忽略', async () => {
      const nowMs = Date.now();
      await addCommitment({
        id: 'test-dismissed-1',
        scope: testScope,
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '完成报告',
        suggestedText: '提醒完成报告',
        dedupeKey: 'deadline_check:完成报告',
        confidence: 0.8,
        dueWindow: {
          earliestMs: nowMs + 1000,
          latestMs: nowMs + 100000,
          timezone: 'Asia/Shanghai',
        },
        status: 'pending',
        createdAtMs: nowMs - 5000,
        updatedAtMs: nowMs - 5000,
        storePath,
      });

      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      await runtime.markDismissed('test-dismissed-1', { storePath, nowMs });

      const updated = await getCommitment({ id: 'test-dismissed-1', storePath });
      expect(updated?.status).toBe('dismissed');
    });

    it('incrementAttempts 应该增加尝试次数', async () => {
      const nowMs = Date.now();
      await addCommitment({
        id: 'test-attempts-1',
        scope: testScope,
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '完成报告',
        suggestedText: '提醒完成报告',
        dedupeKey: 'deadline_check:完成报告',
        confidence: 0.8,
        dueWindow: {
          earliestMs: nowMs + 1000,
          latestMs: nowMs + 100000,
          timezone: 'Asia/Shanghai',
        },
        status: 'pending',
        createdAtMs: nowMs - 5000,
        updatedAtMs: nowMs - 5000,
        attempts: 0,
        storePath,
      });

      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      await runtime.incrementAttempts('test-attempts-1', { storePath, nowMs });

      const updated = await getCommitment({ id: 'test-attempts-1', storePath });
      expect(updated?.attempts).toBe(1);
    });
  });

  describe('统计', () => {
    it('getStats 应该返回统计信息', () => {
      const runtime = createCommitmentRuntime({
        config: { commitments: { enabled: true } },
      });
      const stats = runtime.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.queueSize).toBe('number');
    });
  });
});
