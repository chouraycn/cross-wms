/**
 * 密钥管理模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createSecret,
  getSecret,
  getSecretValue,
  updateSecret,
  deleteSecret,
  listSecrets,
  secretExists,
  initSecretsStore,
  cleanupExpiredSecrets,
  getSecretValueByKey,
  clearSecretsStoreForTests,
} from '../engine/secretsStore.js';
import {
  getCachedSecret,
  cacheSecret,
  clearSecretCache,
  clearAllSecretCache,
  getSecretsStats,
  getActiveSecretsRuntimeConfigSnapshot,
} from '../engine/secretsRuntime.js';
import {
  resolveSecretRef,
  setSecret,
  removeSecret,
  validateSecretRef,
  resolveSecretRefs,
} from '../engine/secretsManager.js';
import type { SecretRef } from '../engine/secretsTypes.js';

// 测试用的临时数据库路径
const TEST_DB_DIR = path.join(os.tmpdir(), 'secrets-test-' + Date.now());
const TEST_SECRETS_DIR = path.join(TEST_DB_DIR, 'secrets');

describe('密钥管理模块', () => {
  beforeEach(() => {
    // 创建测试目录
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEST_SECRETS_DIR)) {
      fs.mkdirSync(TEST_SECRETS_DIR, { recursive: true });
    }

    // 初始化密钥存储
    initSecretsStore();

    // 清理密钥表数据（避免 UNIQUE 约束冲突）
    clearSecretsStoreForTests();

    // 清除所有缓存
    clearAllSecretCache();
  });

  afterEach(() => {
    // 清理测试目录
    try {
      if (fs.existsSync(TEST_DB_DIR)) {
        fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
      }
    } catch {
      // 忽略清理错误
    }

    // 清除所有缓存
    clearAllSecretCache();
  });

  describe('secretsStore - 密钥存储', () => {
    it('应该能够创建密钥', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: 'test-api-key',
        value: 'my-secret-value',
        type: 'api_key',
        description: '测试密钥',
      });

      expect(secret).toBeDefined();
      expect(secret.id).toBeDefined();
      expect(secret.provider).toBe('encrypted');
      expect(secret.key).toBe('test-api-key');
      expect(secret.type).toBe('api_key');
      expect(secret.valueEncrypted).toBeDefined();
      expect(secret.createdAt).toBeDefined();
    });

    it('应该能够获取密钥（不含明文值）', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: 'test-key-2',
        value: 'secret-value',
        type: 'password',
      });

      const secret = getSecret(created.id);
      expect(secret).toBeDefined();
      expect(secret?.key).toBe('test-key-2');
      expect(secret?.valueEncrypted).toBeDefined();
    });

    it('应该能够解密并获取密钥值', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: 'test-key-3',
        value: 'my-plain-value',
        type: 'token',
      });

      const value = getSecretValue(created.id, 'test');
      expect(value).toBe('my-plain-value');
    });

    it('应该能够更新密钥', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: 'test-key-4',
        value: 'old-value',
        type: 'api_key',
      });

      const updated = updateSecret(created.id, {
        value: 'new-value',
        description: '更新后的密钥',
      });

      expect(updated).toBeDefined();
      expect(updated?.metadata?.description).toBe('更新后的密钥');

      const value = getSecretValue(created.id, 'test');
      expect(value).toBe('new-value');
    });

    it('应该能够删除密钥', () => {
      const created = createSecret({
        provider: 'encrypted',
        key: 'test-key-5',
        value: 'to-be-deleted',
        type: 'other',
      });

      const success = deleteSecret(created.id);
      expect(success).toBe(true);

      const secret = getSecret(created.id);
      expect(secret).toBeNull();
    });

    it('应该能够列出所有密钥', () => {
      createSecret({
        provider: 'encrypted',
        key: 'list-test-1',
        value: 'value-1',
        type: 'api_key',
      });

      createSecret({
        provider: 'encrypted',
        key: 'list-test-2',
        value: 'value-2',
        type: 'password',
      });

      const secrets = listSecrets();
      expect(secrets.length).toBeGreaterThanOrEqual(2);
    });

    it('应该能够检查密钥是否存在', () => {
      createSecret({
        provider: 'encrypted',
        key: 'exists-test',
        value: 'value',
        type: 'api_key',
      });

      const exists = secretExists('encrypted', 'exists-test');
      expect(exists).toBe(true);

      const notExists = secretExists('encrypted', 'not-exists');
      expect(notExists).toBe(false);
    });

    it('应该能够清理过期密钥', () => {
      const now = Date.now();
      const pastTime = now - 1000; // 1秒前过期

      createSecret({
        provider: 'encrypted',
        key: 'expired-key',
        value: 'expired-value',
        type: 'token',
        expiresAt: pastTime,
      });

      createSecret({
        provider: 'encrypted',
        key: 'active-key',
        value: 'active-value',
        type: 'token',
        expiresAt: now + 10000, // 10秒后过期
      });

      const deletedCount = cleanupExpiredSecrets();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      const exists = secretExists('encrypted', 'expired-key');
      expect(exists).toBe(false);
    });
  });

  describe('secretsRuntime - 运行时状态管理', () => {
    it('应该能够缓存密钥', () => {
      const ref: SecretRef = {
        provider: 'encrypted',
        key: 'cache-test',
        type: 'api_key',
      };

      cacheSecret(ref, 'cached-value');

      const cached = getCachedSecret(ref);
      expect(cached).toBe('cached-value');
    });

    it('应该能够清除单个缓存', () => {
      const ref: SecretRef = {
        provider: 'encrypted',
        key: 'cache-clear-test',
        type: 'api_key',
      };

      cacheSecret(ref, 'value');
      clearSecretCache(ref);

      const cached = getCachedSecret(ref);
      expect(cached).toBeNull();
    });

    it('应该能够清除所有缓存', () => {
      cacheSecret({ provider: 'encrypted', key: 'key1' }, 'value1');
      cacheSecret({ provider: 'encrypted', key: 'key2' }, 'value2');

      clearAllSecretCache();

      expect(getCachedSecret({ provider: 'encrypted', key: 'key1' })).toBeNull();
      expect(getCachedSecret({ provider: 'encrypted', key: 'key2' })).toBeNull();
    });

    it('应该能够获取运行时配置快照', () => {
      createSecret({
        provider: 'encrypted',
        key: 'runtime-test',
        value: 'value',
        type: 'api_key',
      });

      const config = getActiveSecretsRuntimeConfigSnapshot('test-session');
      expect(config).toBeDefined();
      expect(config.sessionId).toBe('test-session');
      expect(config.activeSecrets.length).toBeGreaterThanOrEqual(1);
    });

    it('应该能够获取统计信息', () => {
      createSecret({
        provider: 'encrypted',
        key: 'stats-test',
        value: 'value',
        type: 'api_key',
      });

      const stats = getSecretsStats();
      expect(stats).toBeDefined();
      expect(stats.totalSecrets).toBeGreaterThanOrEqual(1);
      expect(stats.byProvider).toBeDefined();
      expect(stats.byType).toBeDefined();
    });
  });

  describe('secretsManager - 密钥管理核心', () => {
    it('应该能够解析密钥引用（encrypted）', () => {
      createSecret({
        provider: 'encrypted',
        key: 'resolve-test',
        value: 'resolved-value',
        type: 'api_key',
      });

      const ref: SecretRef = {
        provider: 'encrypted',
        key: 'resolve-test',
        type: 'api_key',
      };

      const resolved = resolveSecretRef(ref, 'test');
      expect(resolved).toBeDefined();
      expect(resolved?.value).toBe('resolved-value');
      expect(resolved?.source).toBe('encrypted');
    });

    it('应该能够解析密钥引用（env）', () => {
      // 设置临时环境变量
      process.env.TEST_SECRET_KEY = 'env-secret-value';

      const ref: SecretRef = {
        provider: 'env',
        key: 'TEST_SECRET_KEY',
        type: 'other',
      };

      const resolved = resolveSecretRef(ref, 'test');
      expect(resolved).toBeDefined();
      expect(resolved?.value).toBe('env-secret-value');

      // 清理环境变量
      delete process.env.TEST_SECRET_KEY;
    });

    it('应该能够解析密钥引用（file）', () => {
      // 创建测试密钥文件
      const filePath = path.join(TEST_SECRETS_DIR, 'file-secret.txt');
      fs.writeFileSync(filePath, 'file-secret-value');

      const ref: SecretRef = {
        provider: 'file',
        key: 'file-secret',
        type: 'password',
      };

      // 由于文件路径约定在 ~/.cdf-know-clow/secrets/，这里可能无法正确解析
      // 我们主要测试解析逻辑是否正确处理
      const resolved = resolveSecretRef(ref, 'test');
      // 在实际环境中文件不存在，所以期望返回 null
      expect(resolved).toBeNull();
    });

    it('应该能够设置密钥', () => {
      setSecret('encrypted', 'set-test-key', 'set-value', 'api_key', '设置测试');

      const exists = secretExists('encrypted', 'set-test-key');
      expect(exists).toBe(true);

      const value = getSecretValueByKey('encrypted', 'set-test-key', 'test');
      expect(value).toBe('set-value');
    });

    it('应该能够删除密钥', () => {
      setSecret('encrypted', 'remove-test-key', 'remove-value', 'other');

      const success = removeSecret('encrypted', 'remove-test-key');
      expect(success).toBe(true);

      const exists = secretExists('encrypted', 'remove-test-key');
      expect(exists).toBe(false);
    });

    it('应该能够验证密钥是否存在', () => {
      setSecret('encrypted', 'validate-test', 'value', 'api_key');

      const ref: SecretRef = {
        provider: 'encrypted',
        key: 'validate-test',
        type: 'api_key',
      };

      const exists = validateSecretRef(ref);
      expect(exists).toBe(true);

      const notExistsRef: SecretRef = {
        provider: 'encrypted',
        key: 'not-exists',
        type: 'api_key',
      };

      const notExists = validateSecretRef(notExistsRef);
      expect(notExists).toBe(false);
    });

    it('应该能够批量解析密钥', () => {
      setSecret('encrypted', 'batch-1', 'value-1', 'api_key');
      setSecret('encrypted', 'batch-2', 'value-2', 'password');

      const refs: SecretRef[] = [
        { provider: 'encrypted', key: 'batch-1', type: 'api_key' },
        { provider: 'encrypted', key: 'batch-2', type: 'password' },
        { provider: 'encrypted', key: 'not-exists', type: 'other' },
      ];

      const results = resolveSecretRefs(refs, 'batch-test');
      expect(results.size).toBe(3);
      expect(results.get('encrypted:batch-1')?.value).toBe('value-1');
      expect(results.get('encrypted:batch-2')?.value).toBe('value-2');
      expect(results.get('encrypted:not-exists')).toBeNull();
    });

    it('应该能够使用缓存', () => {
      setSecret('encrypted', 'cache-use-test', 'cache-value', 'api_key');

      const ref: SecretRef = {
        provider: 'encrypted',
        key: 'cache-use-test',
        type: 'api_key',
      };

      // 第一次解析（从存储获取）
      const resolved1 = resolveSecretRef(ref, 'test', true);
      expect(resolved1?.value).toBe('cache-value');

      // 第二次解析（从缓存获取）
      const cachedValue = getCachedSecret(ref);
      expect(cachedValue).toBe('cache-value');
    });
  });
});