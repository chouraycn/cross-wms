import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  HeartbeatPolicy,
  buildHeartbeatPolicyConfig,
  type HeartbeatPolicyConfig,
  type CommitmentRecord,
  type CommitmentScope,
} from '../index.js';

describe('heartbeat-policy', () => {
  const testScope: CommitmentScope = {
    agentId: 'test-agent',
    sessionKey: 'test-session',
    channel: 'test-channel',
  };

  function createTestCommitment(overrides: Partial<CommitmentRecord> = {}): CommitmentRecord {
    const now = Date.now();
    return {
      id: `commitment-${randomUUID().slice(0, 8)}`,
      agentId: testScope.agentId,
      sessionKey: testScope.sessionKey,
      channel: testScope.channel,
      kind: 'deadline_check',
      sensitivity: 'routine',
      source: 'inferred_user_context',
      priority: 'medium',
      reason: '测试承诺',
      suggestedText: '提醒测试承诺',
      dedupeKey: 'deadline_check:测试承诺',
      confidence: 0.8,
      dueWindow: {
        earliestMs: now + 1000,
        latestMs: now + 100000,
        timezone: 'Asia/Shanghai',
      },
      status: 'pending',
      createdAtMs: now - 5000,
      updatedAtMs: now - 5000,
      attempts: 0,
      tags: [],
      ...overrides,
    };
  }

  describe('HeartbeatPolicy', () => {
    it('应该创建心跳策略实例', () => {
      const config = buildHeartbeatPolicyConfig();
      const policy = new HeartbeatPolicy(config);
      expect(policy).toBeDefined();
      expect(typeof policy.run).toBe('function');
      expect(typeof policy.shouldRun).toBe('function');
    });

    it('应该接受自定义配置', () => {
      const config: HeartbeatPolicyConfig = {
        enabled: true,
        intervalMs: 60000,
        maxPerHeartbeat: 5,
        target: 'all',
        disableTools: false,
        maxRetries: 5,
        retryIntervalMs: 10000,
        backoffFactor: 1.5,
      };
      const policy = new HeartbeatPolicy(config);
      const got = policy.getConfig();
      expect(got.maxPerHeartbeat).toBe(5);
      expect(got.target).toBe('all');
      expect(got.disableTools).toBe(false);
    });

    it('空承诺存储应该返回空结果', async () => {
      const config = buildHeartbeatPolicyConfig({ enabled: true });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => [],
      });
      const result = await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });
      expect(result.status).toBe('ran');
      expect(result.commitmentsDelivered).toBe(0);
      expect(result.commitmentsFailed).toBe(0);
    });

    it('应该加载并传递承诺', async () => {
      const commitments = [createTestCommitment()];
      const config = buildHeartbeatPolicyConfig({ enabled: true });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async () => ({ success: true, messageId: 'msg-1' }),
      });
      const result = await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });
      expect(result.status).toBe('ran');
      expect(result.commitmentsDelivered).toBe(1);
    });

    it('应该遵守 maxPerHeartbeat 限制', async () => {
      const commitments = [
        createTestCommitment({ id: 'c1', priority: 'high' }),
        createTestCommitment({ id: 'c2', priority: 'medium' }),
        createTestCommitment({ id: 'c3', priority: 'low' }),
        createTestCommitment({ id: 'c4', priority: 'urgent' }),
      ];
      const config = buildHeartbeatPolicyConfig({ enabled: true, maxPerHeartbeat: 2 });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async () => ({ success: true }),
      });
      const result = await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });
      expect(result.commitmentsDelivered).toBe(2);
    });

    it('应该按优先级排序', async () => {
      const commitments = [
        createTestCommitment({ id: 'low-priority', priority: 'low' }),
        createTestCommitment({ id: 'high-priority', priority: 'high' }),
        createTestCommitment({ id: 'urgent-priority', priority: 'urgent' }),
      ];
      const delivered: string[] = [];
      const config = buildHeartbeatPolicyConfig({ enabled: true, maxPerHeartbeat: 2 });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async ({ commitment }) => {
          delivered.push(commitment.id);
          return { success: true };
        },
      });
      await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });
      expect(delivered[0]).toBe('urgent-priority');
      expect(delivered[1]).toBe('high-priority');
    });

    it('运行时应该调用 deliver 钩子', async () => {
      let deliverCalled = false;
      const commitments = [createTestCommitment()];
      const config = buildHeartbeatPolicyConfig({ enabled: true });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async () => {
          deliverCalled = true;
          return { success: true };
        },
      });
      await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });
      expect(deliverCalled).toBe(true);
    });

    it('传递失败的承诺应该在 failed 计数中', async () => {
      const commitments = [createTestCommitment()];
      const config = buildHeartbeatPolicyConfig({ enabled: true });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async () => ({ success: false, errorMessage: 'test error' }),
      });
      const result = await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });
      expect(result.commitmentsFailed).toBe(1);
      expect(result.commitmentsDelivered).toBe(0);
    });

    it('getStats 应该返回统计信息', async () => {
      const commitments = [createTestCommitment()];
      const config = buildHeartbeatPolicyConfig({ enabled: true });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async () => ({ success: true }),
      });

      const initialStats = policy.getStats();
      expect(initialStats.totalRuns).toBe(0);

      await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });

      const stats = policy.getStats();
      expect(stats.totalRuns).toBe(1);
      expect(stats.totalDelivered).toBe(1);
      expect(stats.totalChecked).toBe(1);
    });

    it('resetStats 应该重置统计', async () => {
      const commitments = [createTestCommitment()];
      const config = buildHeartbeatPolicyConfig({ enabled: true });
      const policy = new HeartbeatPolicy(config, {
        loadCommitments: async () => commitments,
        deliver: async () => ({ success: true }),
      });

      await policy.run({
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
      });

      policy.resetStats();
      const stats = policy.getStats();
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalDelivered).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.totalChecked).toBe(0);
    });
  });
});
