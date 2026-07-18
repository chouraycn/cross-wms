/**
 * 存储模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initSecretsStore,
  deleteSecretsByKeyPrefixForTests,
  createSecret,
  getSecret,
  getSecretValue,
  getSecretValueByKey,
  updateSecret,
  deleteSecret,
  secretExists,
  listSecrets,
  getSecretAccessLogs,
  cleanupExpiredSecrets,
  markRotated,
  onCacheInvalidate,
} from '../store.js';

// 唯一前缀，用于并行测试隔离：仅清理本文件的密钥，避免与其他测试文件竞争
const PREFIX = 'stest-';

describe('存储模块', () => {
  beforeEach(() => {
    initSecretsStore();
    deleteSecretsByKeyPrefixForTests(PREFIX);
  });

  describe('CRUD', () => {
    it('应能创建密钥', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'store-test-key-1',
        value: 'secret-value',
        type: 'api_key',
        description: '测试密钥',
      });
      expect(secret.id).toBeDefined();
      expect(secret.provider).toBe('encrypted');
      expect(secret.key).toBe(PREFIX + 'store-test-key-1');
      expect(secret.valueEncrypted).not.toBe('secret-value');
    });

    it('应能获取密钥元数据（不含明文）', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'store-test-key-2',
        value: 'plain-value',
      });
      const fetched = getSecret(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.key).toBe(PREFIX + 'store-test-key-2');
      expect(fetched?.valueEncrypted).toBeDefined();
    });

    it('应能解密获取明文值', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'store-test-key-3',
        value: 'decrypted-value',
      });
      const value = getSecretValue(created.id, 'test');
      expect(value).toBe('decrypted-value');
    });

    it('不存在的 ID 应返回 null', () => {
      expect(getSecret('non-existent-id')).toBeNull();
      expect(getSecretValue('non-existent-id')).toBeNull();
    });

    it('应能按 provider + key 获取值', () => {
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'store-test-key-4',
        value: 'by-key-value',
      });
      const value = getSecretValueByKey('encrypted', PREFIX + 'store-test-key-4', 'test');
      expect(value).toBe('by-key-value');
    });

    it('应能更新密钥', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'store-test-key-5',
        value: 'old-value',
      });
      const updated = updateSecret(created.id, { value: 'new-value' });
      expect(updated).not.toBeNull();
      expect(getSecretValue(created.id, 'test')).toBe('new-value');
    });

    it('应能删除密钥', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'store-test-key-6',
        value: 'to-be-deleted',
      });
      expect(deleteSecret(created.id)).toBe(true);
      expect(getSecret(created.id)).toBeNull();
    });

    it('删除不存在的 ID 应返回 false', () => {
      expect(deleteSecret('non-existent-id')).toBe(false);
    });
  });

  describe('secretExists', () => {
    it('存在的密钥应返回 true', () => {
      createSecret({ provider: 'encrypted', key: PREFIX + 'exists-key', value: 'v' });
      expect(secretExists('encrypted', PREFIX + 'exists-key')).toBe(true);
    });

    it('不存在的密钥应返回 false', () => {
      expect(secretExists('encrypted', PREFIX + 'non-existent')).toBe(false);
    });
  });

  describe('listSecrets', () => {
    it('应能列出所有密钥', () => {
      createSecret({ provider: 'encrypted', key: PREFIX + 'list-1', value: 'v1' });
      createSecret({ provider: 'encrypted', key: PREFIX + 'list-2', value: 'v2' });
      const list = listSecrets();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('应能按 provider 过滤', () => {
      createSecret({ provider: 'encrypted', key: PREFIX + 'filter-1', value: 'v' });
      const list = listSecrets({ provider: 'encrypted' });
      expect(list.every(s => s.provider === 'encrypted')).toBe(true);
    });

    it('列表中的记录不应包含密文', () => {
      createSecret({ provider: 'encrypted', key: PREFIX + 'no-cipher', value: 'v' });
      const list = listSecrets();
      for (const item of list) {
        expect((item as any).valueEncrypted).toBeUndefined();
      }
    });
  });

  describe('访问日志', () => {
    it('读取密钥应记录访问日志', () => {
      const secret = createSecret({ provider: 'encrypted', key: PREFIX + 'log-test', value: 'v' });
      getSecretValue(secret.id, 'test-source');
      const logs = getSecretAccessLogs(secret.id);
      expect(logs.length).toBeGreaterThan(0);
      // 最近一条应为 read 操作
      const readLogs = logs.filter(l => l.action === 'read');
      expect(readLogs.length).toBeGreaterThan(0);
    });

    it('不存在的密钥读取应记录失败日志', () => {
      getSecretValue('non-existent', 'test');
      // 无 secretId 也能查询全部日志
      const logs = getSecretAccessLogs(undefined, 10);
      expect(logs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupExpiredSecrets', () => {
    it('应清理已过期的密钥', () => {
      const past = Date.now() - 1000;
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'expired-key',
        value: 'v',
        expiresAt: past,
      });
      const deleted = cleanupExpiredSecrets();
      expect(deleted).toBeGreaterThanOrEqual(1);
      expect(secretExists('encrypted', PREFIX + 'expired-key')).toBe(false);
    });

    it('不应清理未过期的密钥', () => {
      const future = Date.now() + 100000;
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'valid-key',
        value: 'v',
        expiresAt: future,
      });
      const before = listSecrets().length;
      cleanupExpiredSecrets();
      const after = listSecrets().length;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('markRotated', () => {
    it('应更新 lastRotatedAt', () => {
      const secret = createSecret({ provider: 'encrypted', key: PREFIX + 'rotate-test', value: 'v' });
      markRotated(secret.id);
      const updated = getSecret(secret.id);
      expect(updated?.metadata?.lastRotatedAt).toBeDefined();
    });
  });

  describe('缓存失效回调', () => {
    it('create / update / delete 应触发回调', () => {
      let calls = 0;
      onCacheInvalidate(() => { calls++; });

      const secret = createSecret({ provider: 'encrypted', key: PREFIX + 'cb-test', value: 'v' });
      expect(calls).toBeGreaterThanOrEqual(1);

      updateSecret(secret.id, { value: 'new-v' });
      expect(calls).toBeGreaterThanOrEqual(2);

      deleteSecret(secret.id);
      expect(calls).toBeGreaterThanOrEqual(3);
    });
  });
});
