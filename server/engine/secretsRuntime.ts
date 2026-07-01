/**
 * 密钥运行时状态管理
 *
 * 提供密钥缓存、运行时配置快照、刷新机制
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { TimerManager } from '../core/timerManager.js';
import type {
  SecretRef,
  SecretCacheEntry,
  SecretsRuntimeConfig,
  SecretsStats,
  SecretProvider,
} from './secretsTypes.js';
import { listSecrets, getSecretValue, getSecretValueByKey } from './secretsStore.js';

// 密钥缓存
const secretCache = new Map<string, SecretCacheEntry>();

// 运行时配置快照缓存
let currentRuntimeConfig: SecretsRuntimeConfig | null = null;
let lastConfigSnapshotTime = 0;

// 缓存配置
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存过期
const CONFIG_SNAPSHOT_TTL_MS = 10 * 60 * 1000; // 10 分钟配置快照过期

// 缓存统计
let cacheHits = 0;
let cacheMisses = 0;

/**
 * 生成缓存键
 */
function getCacheKey(ref: SecretRef): string {
  return `${ref.provider}:${ref.key}`;
}

/**
 * 获取当前激活的密钥运行时配置快照
 */
export function getActiveSecretsRuntimeConfigSnapshot(sessionId?: string): SecretsRuntimeConfig {
  const now = Date.now();

  // 如果快照未过期，直接返回
  if (
    currentRuntimeConfig &&
    now - lastConfigSnapshotTime < CONFIG_SNAPSHOT_TTL_MS &&
    (sessionId === undefined || currentRuntimeConfig.sessionId === sessionId)
  ) {
    return currentRuntimeConfig;
  }

  // 创建新快照
  const secrets = listSecrets();
  const activeSecrets: SecretRef[] = secrets.map((s) => ({
    provider: s.provider,
    key: s.key,
    type: s.type,
  }));

  const newConfig: SecretsRuntimeConfig = {
    activeSecrets,
    snapshotTime: now,
    sessionId: sessionId || uuidv4(),
  };

  currentRuntimeConfig = newConfig;
  lastConfigSnapshotTime = now;

  logger.info('[SecretsRuntime] 运行时配置快照已创建', {
    sessionId: newConfig.sessionId,
    secretsCount: activeSecrets.length,
  });

  return newConfig;
}

/**
 * 从缓存获取密钥值
 */
export function getCachedSecret(ref: SecretRef): string | null {
  const cacheKey = getCacheKey(ref);
  const entry = secretCache.get(cacheKey);

  if (!entry) {
    cacheMisses++;
    return null;
  }

  // 检查缓存是否过期
  const now = Date.now();
  if (entry.expiresAt && now >= entry.expiresAt) {
    secretCache.delete(cacheKey);
    cacheMisses++;
    logger.info('[SecretsRuntime] 缓存已过期', { cacheKey });
    return null;
  }

  // 检查密钥是否已过期（如果有过期时间）
  const secrets = listSecrets(ref.provider);
  const secretMeta = secrets.find((s) => s.key === ref.key);
  if (secretMeta?.metadata?.expiresAt && now >= secretMeta.metadata.expiresAt) {
    secretCache.delete(cacheKey);
    cacheMisses++;
    logger.warn('[SecretsRuntime] 密钥已过期', { provider: ref.provider, key: ref.key });
    return null;
  }

  cacheHits++;
  return entry.value;
}

/**
 * 将密钥值缓存
 */
export function cacheSecret(ref: SecretRef, value: string, ttlMs?: number): void {
  const cacheKey = getCacheKey(ref);
  const now = Date.now();

  const entry: SecretCacheEntry = {
    value,
    cachedAt: now,
    expiresAt: ttlMs ? now + ttlMs : now + CACHE_TTL_MS,
  };

  secretCache.set(cacheKey, entry);
  logger.debug('[SecretsRuntime] 密钥已缓存', { cacheKey, ttlMs });
}

/**
 * 刷新密钥缓存
 */
export function refreshSecret(ref: SecretRef, source: string = 'refresh'): string | null {
  const cacheKey = getCacheKey(ref);

  // 从存储获取新值
  const value = getSecretValueByKey(ref.provider, ref.key, source);

  if (value) {
    cacheSecret(ref, value);
    logger.info('[SecretsRuntime] 密钥已刷新', { cacheKey });
    return value;
  }

  // 如果获取失败，清除缓存
  secretCache.delete(cacheKey);
  logger.warn('[SecretsRuntime] 密钥刷新失败', { cacheKey });
  return null;
}

/**
 * 批量刷新密钥
 */
export function refreshSecrets(refs: SecretRef[], source: string = 'batch-refresh'): void {
  for (const ref of refs) {
    refreshSecret(ref, source);
  }

  logger.info('[SecretsRuntime] 批量密钥已刷新', { count: refs.length });
}

/**
 * 清除单个密钥缓存
 */
export function clearSecretCache(ref: SecretRef): void {
  const cacheKey = getCacheKey(ref);
  secretCache.delete(cacheKey);
  logger.debug('[SecretsRuntime] 密钥缓存已清除', { cacheKey });
}

/**
 * 清除所有密钥缓存
 */
export function clearAllSecretCache(): void {
  const count = secretCache.size;
  secretCache.clear();
  logger.info('[SecretsRuntime] 所有密钥缓存已清除', { count });
}

/**
 * 获取密钥统计信息
 */
export function getSecretsStats(): SecretsStats {
  const secrets = listSecrets();
  const now = Date.now();

  // 按提供者统计
  const byProvider: Record<SecretProvider, number> = {
    env: 0,
    file: 0,
    encrypted: 0,
    keychain: 0,
  };

  // 按类型统计
  const byType: Record<string, number> = {};

  for (const secret of secrets) {
    byProvider[secret.provider] = (byProvider[secret.provider] || 0) + 1;
    byType[secret.type] = (byType[secret.type] || 0) + 1;
  }

  // 计算缓存命中率
  const totalAccesses = cacheHits + cacheMisses;
  const cacheHitRate = totalAccesses > 0 ? cacheHits / totalAccesses : 0;

  return {
    totalSecrets: secrets.length,
    byProvider,
    byType,
    cacheHitRate,
    lastUpdated: now,
  };
}

/**
 * 重置缓存统计
 */
export function resetCacheStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  logger.info('[SecretsRuntime] 缓存统计已重置');
}

/**
 * 获取缓存大小
 */
export function getCacheSize(): number {
  return secretCache.size;
}

/**
 * 检查密钥缓存是否存在
 */
export function hasCachedSecret(ref: SecretRef): boolean {
  const cacheKey = getCacheKey(ref);
  return secretCache.has(cacheKey);
}

/**
 * 导出运行时配置（用于调试）
 */
export function exportRuntimeConfig(): {
  config: SecretsRuntimeConfig | null;
  cacheSize: number;
  cacheStats: { hits: number; misses: number; hitRate: number };
} {
  const totalAccesses = cacheHits + cacheMisses;
  return {
    config: currentRuntimeConfig,
    cacheSize: secretCache.size,
    cacheStats: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: totalAccesses > 0 ? cacheHits / totalAccesses : 0,
    },
  };
}

/**
 * 周期性清理过期缓存
 */
export function startCacheCleanup(intervalMs: number = 60 * 1000): NodeJS.Timeout | null {
  return TimerManager.register({
    name: 'secrets-cache-cleanup',
    intervalMs,
    callback: () => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, entry] of secretCache.entries()) {
        if (entry.expiresAt && now >= entry.expiresAt) {
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        for (const key of expiredKeys) {
          secretCache.delete(key);
        }
        logger.info('[SecretsRuntime] 已清理过期缓存', { count: expiredKeys.length });
      }
    },
    unref: true,
  });
}