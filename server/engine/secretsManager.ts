/**
 * 密钥管理核心模块
 *
 * 提供 SecretRef 类型解析、多提供者支持、密钥存储接口
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';
import { initDb } from '../db.js';
import type {
  SecretRef,
  ResolvedSecret,
  SecretProvider,
  CreateSecretRequest,
  UpdateSecretRequest,
} from './secretsTypes.js';
import {
  createSecret,
  getSecretValueByKey,
  updateSecret,
  deleteSecret,
  secretExists,
  initSecretsStore,
} from './secretsStore.js';
import {
  getCachedSecret,
  cacheSecret,
  refreshSecret,
  clearSecretCache,
  clearAllSecretCache,
  getActiveSecretsRuntimeConfigSnapshot,
  getSecretsStats,
} from './secretsRuntime.js';

/**
 * 解析密钥引用
 *
 * 从不同提供者获取密钥值，优先使用缓存
 * 提供者优先级：env > encrypted > file > keychain
 *
 * @param ref - 密钥引用
 * @param source - 访问来源标识
 * @param useCache - 是否使用缓存（默认 true）
 * @returns 解析后的密钥结果
 */
export function resolveSecretRef(
  ref: SecretRef,
  source: string = 'unknown',
  useCache: boolean = true
): ResolvedSecret | null {
  initSecretsStore();

  // 尝试从缓存获取
  if (useCache) {
    const cachedValue = getCachedSecret(ref);
    if (cachedValue) {
      return {
        ref,
        value: cachedValue,
        source: ref.provider,
        resolvedAt: Date.now(),
      };
    }
  }

  // 根据提供者类型解析
  let value: string | null = null;

  switch (ref.provider) {
    case 'env':
      value = resolveFromEnv(ref.key);
      break;

    case 'encrypted':
      value = resolveFromEncryptedStore(ref.key, source);
      break;

    case 'file':
      value = resolveFromFile(ref.key);
      break;

    case 'keychain':
      value = resolveFromKeychain(ref.key, source);
      break;

    default:
      logger.warn('[SecretsManager] 未知的密钥提供者类型', { provider: ref.provider });
      return null;
  }

  if (!value) {
    logger.warn('[SecretsManager] 密钥解析失败', { ref });
    return null;
  }

  // 缓存解析结果
  if (useCache) {
    cacheSecret(ref, value);
  }

  return {
    ref,
    value,
    source: ref.provider,
    resolvedAt: Date.now(),
  };
}

/**
 * 从环境变量解析密钥
 */
function resolveFromEnv(key: string): string | null {
  const value = process.env[key];

  if (!value) {
    logger.warn('[SecretsManager] 环境变量不存在', { key });
    return null;
  }

  logger.debug('[SecretsManager] 从环境变量获取密钥', { key });
  return value;
}

/**
 * 从加密存储解析密钥
 */
function resolveFromEncryptedStore(key: string, source: string): string | null {
  const value = getSecretValueByKey('encrypted', key, source);

  if (!value) {
    logger.warn('[SecretsManager] 加密存储中密钥不存在', { key });
    return null;
  }

  logger.debug('[SecretsManager] 从加密存储获取密钥', { key });
  return value;
}

/**
 * 从文件解析密钥
 *
 * 文件路径约定：~/.cdf-know-clow/secrets/{key}.txt
 */
function resolveFromFile(key: string): string | null {
  const secretsDir = path.join(os.homedir(), '.cdf-know-clow', 'secrets');
  const filePath = path.join(secretsDir, `${key}.txt`);

  if (!fs.existsSync(filePath)) {
    logger.warn('[SecretsManager] 密钥文件不存在', { filePath });
    return null;
  }

  try {
    const value = fs.readFileSync(filePath, 'utf-8').trim();
    logger.debug('[SecretsManager] 从文件获取密钥', { key });
    return value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[SecretsManager] 读取密钥文件失败', { filePath, error: errorMessage });
    return null;
  }
}

/**
 * 从系统密钥链解析密钥
 *
 * 使用 keytar 或系统级密钥存储
 */
function resolveFromKeychain(key: string, source: string): string | null {
  // macOS 使用 Keychain
  // Windows 使用 Credential Manager
  // Linux 使用 Secret Service API

  // 当前实现：回退到加密存储（避免跨平台兼容性问题）
  const value = getSecretValueByKey('keychain', key, source);

  if (!value) {
    logger.warn('[SecretsManager] 密钥链中密钥不存在', { key });
    return null;
  }

  logger.debug('[SecretsManager] 从密钥链获取密钥', { key });
  return value;
}

/**
 * 设置密钥（存储到加密存储）
 */
export function setSecret(
  provider: SecretProvider,
  key: string,
  value: string,
  type?: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other',
  description?: string
): void {
  initSecretsStore();

  // 检查是否已存在
  if (secretExists(provider, key)) {
    // 更新现有密钥
    updateSecret(
      getSecretId(provider, key) || '',
      { value, type, description }
    );
    logger.info('[SecretsManager] 密钥已更新', { provider, key });
  } else {
    // 创建新密钥
    createSecret({
      provider,
      key,
      value,
      type: type || 'other',
      description,
    });
    logger.info('[SecretsManager] 密钥已创建', { provider, key });
  }

  // 更新缓存
  const ref: SecretRef = { provider, key, type };
  cacheSecret(ref, value);
}

/**
 * 删除密钥
 */
export function removeSecret(provider: SecretProvider, key: string): boolean {
  initSecretsStore();

  const id = getSecretId(provider, key);
  if (!id) {
    logger.warn('[SecretsManager] 密钥不存在', { provider, key });
    return false;
  }

  const success = deleteSecret(id);

  if (success) {
    // 清除缓存
    const ref: SecretRef = { provider, key };
    clearSecretCache(ref);
    logger.info('[SecretsManager] 密钥已删除', { provider, key });
  }

  return success;
}

/**
 * 获取密钥 ID
 */
function getSecretId(provider: SecretProvider, key: string): string | null {
  initSecretsStore();
  const db = initDb();

  const stmt = db.prepare(`
    SELECT id FROM secrets WHERE provider = ? AND key = ?
  `);

  const row = stmt.get(provider, key) as { id: string } | undefined;
  return row?.id || null;
}

/**
 * 批量解析密钥
 */
export function resolveSecretRefs(
  refs: SecretRef[],
  source: string = 'batch-resolve',
  useCache: boolean = true
): Map<string, ResolvedSecret | null> {
  const results = new Map<string, ResolvedSecret | null>();

  for (const ref of refs) {
    const cacheKey = `${ref.provider}:${ref.key}`;
    const result = resolveSecretRef(ref, source, useCache);
    results.set(cacheKey, result);
  }

  logger.info('[SecretsManager] 批量密钥解析完成', {
    count: refs.length,
    successCount: Array.from(results.values()).filter((r) => r !== null).length,
  });

  return results;
}

/**
 * 刷新密钥（强制从存储重新获取）
 */
export function refreshSecretRef(ref: SecretRef, source: string = 'manual-refresh'): ResolvedSecret | null {
  clearSecretCache(ref);
  return resolveSecretRef(ref, source, false);
}

/**
 * 验证密钥是否存在
 */
export function validateSecretRef(ref: SecretRef): boolean {
  initSecretsStore();

  switch (ref.provider) {
    case 'env':
      return !!process.env[ref.key];

    case 'encrypted':
    case 'keychain':
      return secretExists(ref.provider, ref.key);

    case 'file':
      const secretsDir = path.join(os.homedir(), '.cdf-know-clow', 'secrets');
      const filePath = path.join(secretsDir, `${ref.key}.txt`);
      return fs.existsSync(filePath);

    default:
      return false;
  }
}

/**
 * 获取密钥管理器状态
 */
export function getSecretsManagerStatus(): {
  initialized: boolean;
  cacheSize: number;
  stats: ReturnType<typeof getSecretsStats>;
  runtimeConfig: ReturnType<typeof getActiveSecretsRuntimeConfigSnapshot>;
} {
  return {
    initialized: true,
    cacheSize: 0,
    stats: getSecretsStats(),
    runtimeConfig: getActiveSecretsRuntimeConfigSnapshot(),
  };
}

/**
 * 初始化密钥管理器
 */
export function initSecretsManager(): void {
  initSecretsStore();
  logger.info('[SecretsManager] 密钥管理器已初始化');
}

/**
 * 清理所有资源
 */
export function cleanupSecretsManager(): void {
  clearAllSecretCache();
  logger.info('[SecretsManager] 密钥管理器已清理');
}