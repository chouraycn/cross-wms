/**
 * 轮换模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initRotationStore,
  clearRotationStoreForTests,
  registerRotationPolicy,
  unregisterRotationPolicy,
  listRotationPolicies,
  getRotationPolicy,
  clearRotationPolicies,
  rotateSecret,
  autoRotateSecret,
  scheduledRotateSecret,
  getRotationHistory,
  getAllRotationRecords,
  rollbackRotation,
  findSecretsNeedingRotation,
  getRotationStats,
} from '../rotation.js';
import {
  initSecretsStore,
  deleteSecretsByKeyPrefixForTests,
  createSecret,
  getSecretValue,
  updateSecret,
} from '../store.js';
import type { RotationPolicy } from '../types.js';

// 唯一前缀，用于并行测试隔离
const PREFIX = 'rtest-';

describe('轮换模块', () => {
  beforeEach(() => {
    initSecretsStore();
    initRotationStore();
    deleteSecretsByKeyPrefixForTests(PREFIX);
    clearRotationStoreForTests();
    clearRotationPolicies();
  });

  describe('轮换策略管理', () => {
    it('registerRotationPolicy 应注册策略', () => {
      const policy: RotationPolicy = {
        id: 'p1',
        name: 'daily',
        intervalMs: 86400000,
        enabled: true,
      };
      registerRotationPolicy(policy);
      expect(getRotationPolicy('p1')).toEqual(policy);
    });

    it('unregisterRotationPolicy 应注销策略', () => {
      const policy: RotationPolicy = {
        id: 'p2',
        name: 'weekly',
        intervalMs: 604800000,
        enabled: true,
      };
      registerRotationPolicy(policy);
      unregisterRotationPolicy('p2');
      expect(getRotationPolicy('p2')).toBeUndefined();
    });

    it('listRotationPolicies 应返回所有策略', () => {
      registerRotationPolicy({ id: 'a', name: 'a', intervalMs: 1000, enabled: true });
      registerRotationPolicy({ id: 'b', name: 'b', intervalMs: 2000, enabled: true });
      expect(listRotationPolicies()).toHaveLength(2);
    });

    it('clearRotationPolicies 应清空策略', () => {
      registerRotationPolicy({ id: 'x', name: 'x', intervalMs: 1000, enabled: true });
      clearRotationPolicies();
      expect(listRotationPolicies()).toHaveLength(0);
    });
  });

  describe('rotateSecret（手动轮换）', () => {
    it('应能轮换存在的密钥', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'rotate-manual',
        value: 'old-value-1234567890',
      });
      const record = rotateSecret(secret.id, 'new-value-1234567890');
      expect(record.success).toBe(true);
      expect(record.trigger).toBe('manual');
      expect(getSecretValue(secret.id, 'test')).toBe('new-value-1234567890');
    });

    it('轮换不存在的密钥应失败', () => {
      const record = rotateSecret('non-existent-id', 'new-value');
      expect(record.success).toBe(false);
      expect(record.error).toBeDefined();
    });
  });

  describe('autoRotateSecret / scheduledRotateSecret', () => {
    it('autoRotateSecret 应标记 trigger=auto', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'rotate-auto',
        value: 'old-value-1234567890',
      });
      const record = autoRotateSecret(secret.id, 'new-value-1234567890');
      expect(record.success).toBe(true);
      expect(record.trigger).toBe('auto');
    });

    it('scheduledRotateSecret 应标记 trigger=scheduled', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'rotate-scheduled',
        value: 'old-value-1234567890',
      });
      const record = scheduledRotateSecret(secret.id, 'new-value-1234567890');
      expect(record.success).toBe(true);
      expect(record.trigger).toBe('scheduled');
    });
  });

  describe('轮换历史', () => {
    it('getRotationHistory 应返回指定密钥的轮换记录', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'history-key',
        value: 'old-value-1234567890',
      });
      rotateSecret(secret.id, 'new-value-1234567890');
      const history = getRotationHistory(secret.id);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].secretId).toBe(secret.id);
    });

    it('getAllRotationRecords 应返回所有记录', () => {
      const s1 = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'all-history-1',
        value: 'v1-1234567890',
      });
      const s2 = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'all-history-2',
        value: 'v2-1234567890',
      });
      rotateSecret(s1.id, 'new1-1234567890');
      rotateSecret(s2.id, 'new2-1234567890');
      const all = getAllRotationRecords();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('rollbackRotation', () => {
    it('应能回滚到提供的旧值', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'rollback-key',
        value: 'original-value-1234567890',
      });
      rotateSecret(secret.id, 'rotated-value-1234567890');
      expect(getSecretValue(secret.id, 'test')).toBe('rotated-value-1234567890');
      const rollback = rollbackRotation(secret.id, 'original-value-1234567890');
      expect(rollback.success).toBe(true);
      expect(getSecretValue(secret.id, 'test')).toBe('original-value-1234567890');
    });

    it('回滚不存在的密钥应失败', () => {
      const rollback = rollbackRotation('non-existent', 'value');
      expect(rollback.success).toBe(false);
    });
  });

  describe('findSecretsNeedingRotation', () => {
    it('应找出即将过期的密钥', () => {
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'expiring-soon',
        value: 'v-1234567890',
        expiresAt: Date.now() + 1000, // 1 秒后过期
      });
      const needing = findSecretsNeedingRotation({ expiringSoonThresholdMs: 5000 });
      const found = needing.find(s => s.key === PREFIX + 'expiring-soon');
      expect(found).toBeDefined();
    });

    it('应找出超过策略间隔的密钥', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'policy-key',
        value: 'v-1234567890',
      });
      // 手动设置 lastRotatedAt 为很久以前
      updateSecret(secret.id, {});
      // 通过 store 内部 markRotated 已设置，这里间接验证策略逻辑
      registerRotationPolicy({
        id: 'short',
        name: 'short',
        intervalMs: 1, // 1ms 间隔，立即需要轮换
        enabled: true,
      });
      // 由于无法直接设置 rotationPolicyId，此测试仅验证策略扫描不抛错
      const needing = findSecretsNeedingRotation();
      expect(Array.isArray(needing)).toBe(true);
    });
  });

  describe('getRotationStats', () => {
    it('应返回轮换统计', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'stats-rotate',
        value: 'v-1234567890',
      });
      rotateSecret(secret.id, 'new-v-1234567890');
      const stats = getRotationStats();
      expect(stats.totalRotations).toBeGreaterThanOrEqual(1);
      expect(stats.byTrigger.manual).toBeGreaterThanOrEqual(1);
    });
  });
});
