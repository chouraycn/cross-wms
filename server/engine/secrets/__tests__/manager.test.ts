/**
 * 管理器模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecretsManager,
  createSecretsManager,
  validateSecretRefFormat,
  generateSecretId,
} from '../manager.js';
import {
  initSecretsStore,
  deleteSecretsByKeyPrefixForTests,
} from '../store.js';
import { ProviderRegistry, EnvProvider } from '../provider.js';

// 唯一前缀，用于并行测试隔离
const PREFIX = 'mtest-';

describe('管理器模块', () => {
  let manager: SecretsManager;

  beforeEach(() => {
    initSecretsStore();
    deleteSecretsByKeyPrefixForTests(PREFIX);
    const registry = new ProviderRegistry();
    registry.register(new EnvProvider({ env: { MGR_KEY: 'env-value' } }));
    manager = new SecretsManager({ registry });
  });

  describe('CRUD', () => {
    it('应能创建密钥', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'mgr-create',
        value: 'long-enough-value',
        type: 'api_key',
      });
      expect(secret.id).toBeDefined();
      expect(secret.key).toBe(PREFIX + 'mgr-create');
    });

    it('重复创建应抛错', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'dup-key', value: 'value123' });
      expect(() =>
        manager.create({ provider: 'encrypted', key: PREFIX + 'dup-key', value: 'value123' }),
      ).toThrow();
    });

    it('应能获取密钥值', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'mgr-get',
        value: 'mgr-value',
      });
      expect(manager.getValue(secret.id)).toBe('mgr-value');
    });

    it('应能按 provider + key 获取', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'mgr-getbykey', value: 'v' });
      const record = manager.getByKey('encrypted', PREFIX + 'mgr-getbykey');
      expect(record?.key).toBe(PREFIX + 'mgr-getbykey');
    });

    it('应能更新密钥', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'mgr-update',
        value: 'old-value',
      });
      manager.update(secret.id, { value: 'new-value' });
      expect(manager.getValue(secret.id)).toBe('new-value');
    });

    it('应能删除密钥', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'mgr-delete',
        value: 'v',
      });
      expect(manager.delete(secret.id)).toBe(true);
      expect(manager.get(secret.id)).toBeNull();
    });

    it('应能列出密钥', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'mgr-list-1', value: 'v' });
      manager.create({ provider: 'encrypted', key: PREFIX + 'mgr-list-2', value: 'v' });
      const list = manager.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('exists 应返回是否存在的密钥', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'mgr-exists', value: 'v' });
      expect(manager.exists('encrypted', PREFIX + 'mgr-exists')).toBe(true);
      expect(manager.exists('encrypted', PREFIX + 'non-existent')).toBe(false);
    });
  });

  describe('解析', () => {
    it('应能解析 env 密钥', () => {
      const result = manager.resolve({ provider: 'env', key: 'MGR_KEY' });
      expect(result?.value).toBe('env-value');
    });

    it('应能批量解析', () => {
      const refs = [
        { provider: 'env' as const, key: 'MGR_KEY' },
        { provider: 'env' as const, key: 'UNDEFINED' },
      ];
      const results = manager.resolveBatch(refs);
      expect(results.size).toBe(2);
      expect(results.get('env:MGR_KEY')?.value).toBe('env-value');
      expect(results.get('env:UNDEFINED')).toBeNull();
    });

    it('应能按回退链解析', () => {
      const refs = [
        { provider: 'env' as const, key: 'UNDEFINED' },
        { provider: 'env' as const, key: 'MGR_KEY' },
      ];
      const result = manager.resolveWithFallback(refs);
      expect(result?.value).toBe('env-value');
    });
  });

  describe('批量操作', () => {
    it('createBatch 应批量创建', () => {
      const result = manager.createBatch([
        { provider: 'encrypted', key: PREFIX + 'batch-1', value: 'v1' },
        { provider: 'encrypted', key: PREFIX + 'batch-2', value: 'v2' },
      ]);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('createBatch 部分失败应记录错误', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'existing', value: 'v' });
      const result = manager.createBatch([
        { provider: 'encrypted', key: PREFIX + 'batch-ok', value: 'v' },
        { provider: 'encrypted', key: PREFIX + 'existing', value: 'v' }, // 重复，应失败
      ]);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('deleteBatch 应批量删除', () => {
      const s1 = manager.create({ provider: 'encrypted', key: PREFIX + 'del-1', value: 'v' });
      const s2 = manager.create({ provider: 'encrypted', key: PREFIX + 'del-2', value: 'v' });
      const result = manager.deleteBatch([s1.id, s2.id]);
      expect(result.succeeded).toBe(2);
    });
  });

  describe('导入导出', () => {
    it('importSecrets 应批量导入', () => {
      const result = manager.importSecrets([
        { provider: 'encrypted', key: PREFIX + 'import-1', value: 'v1' },
        { provider: 'encrypted', key: PREFIX + 'import-2', value: 'v2' },
      ]);
      expect(result.succeeded).toBe(2);
    });

    it('importSecrets 不覆盖模式下重复应失败', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'import-dup', value: 'v' });
      const result = manager.importSecrets([
        { provider: 'encrypted', key: PREFIX + 'import-dup', value: 'new' },
      ]);
      expect(result.failed).toBe(1);
    });

    it('importSecrets 覆盖模式应更新', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'import-overwrite', value: 'old' });
      const result = manager.importSecrets(
        [{ provider: 'encrypted', key: PREFIX + 'import-overwrite', value: 'new' }],
        true,
      );
      expect(result.succeeded).toBe(1);
    });

    it('exportSecrets 应导出元数据（不含明文）', () => {
      manager.create({ provider: 'encrypted', key: PREFIX + 'export-1', value: 'v' });
      const exported = manager.exportSecrets();
      expect(exported.length).toBeGreaterThanOrEqual(1);
      for (const item of exported) {
        expect((item as any).value).toBeUndefined();
        expect((item as any).valueEncrypted).toBeUndefined();
      }
    });
  });

  describe('强度评估', () => {
    it('应能评估密钥强度', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'strength-test',
        value: 'xY9!aB2#cD7$eF4%',
      });
      const strength = manager.assessStrength(secret.id);
      expect(strength).not.toBeNull();
      expect(strength?.score).toBeGreaterThan(0);
    });
  });

  describe('isExpired', () => {
    it('无 expiresAt 应返回 false', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'no-expire',
        value: 'v',
      });
      expect(manager.isExpired(secret.id)).toBe(false);
    });

    it('已过期应返回 true', () => {
      const secret = manager.create({
        provider: 'encrypted',
        key: PREFIX + 'expired',
        value: 'v',
        expiresAt: Date.now() - 1000,
      });
      expect(manager.isExpired(secret.id)).toBe(true);
    });
  });

  describe('脱敏', () => {
    it('redact 应脱敏已注册的密钥值', () => {
      manager.create({
        provider: 'encrypted',
        key: PREFIX + 'redact-test',
        value: 'very-long-secret-value-1234567890',
      });
      const result = manager.redact('使用 very-long-secret-value-1234567890 认证');
      expect(result).not.toContain('very-long-secret-value-1234567890');
    });
  });

  describe('工具函数', () => {
    it('validateSecretRefFormat 应校验格式', () => {
      const result = validateSecretRefFormat({ provider: 'env', key: 'VALID_KEY' });
      expect(result.valid).toBe(true);
    });

    it('generateSecretId 应返回 UUID 字符串', () => {
      const id = generateSecretId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('createSecretsManager 应返回实例', () => {
      const m = createSecretsManager();
      expect(m).toBeInstanceOf(SecretsManager);
    });
  });
});
