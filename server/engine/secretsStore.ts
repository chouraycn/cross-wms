/**
 * 密钥存储模块
 *
 * 使用 SQLite + AES-256-GCM 实现密钥安全存储
 * - 密钥表：id, provider, key, value_encrypted, type, createdAt, updatedAt
 * - 访问日志表：id, secret_id, accessed_at, source, action, success
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import { logger } from '../logger.js';
import { encrypt, decrypt, ensureEncryptionKey } from './crypto.js';
import type {
  SecretValue,
  SecretAccessLog,
  CreateSecretRequest,
  UpdateSecretRequest,
  SecretProvider,
} from './secretsTypes.js';

// 数据库表定义
const SECRETS_TABLE = 'secrets';
const SECRETS_ACCESS_LOG_TABLE = 'secrets_access_log';

let secretsInitialized = false;

/**
 * 初始化密钥存储表
 */
export function initSecretsStore(): void {
  if (secretsInitialized) return;

  const db = initDb();

  // 创建密钥表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SECRETS_TABLE} (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      key TEXT NOT NULL,
      value_encrypted TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'api_key',
      description TEXT,
      expires_at INTEGER,
      last_accessed_at INTEGER,
      access_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, key)
    )
  `);

  // 创建访问日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SECRETS_ACCESS_LOG_TABLE} (
      id TEXT PRIMARY KEY,
      secret_id TEXT NOT NULL,
      accessed_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      FOREIGN KEY (secret_id) REFERENCES ${SECRETS_TABLE}(id) ON DELETE CASCADE
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_secrets_provider_key ON ${SECRETS_TABLE}(provider, key);
    CREATE INDEX IF NOT EXISTS idx_secrets_access_log_secret_id ON ${SECRETS_ACCESS_LOG_TABLE}(secret_id);
    CREATE INDEX IF NOT EXISTS idx_secrets_access_log_accessed_at ON ${SECRETS_ACCESS_LOG_TABLE}(accessed_at);
  `);

  secretsInitialized = true;
  logger.info('[SecretsStore] 密钥存储表已初始化');
}

/**
 * 获取加密密钥
 */
function getEncryptionKey(): string {
  return ensureEncryptionKey();
}

/**
 * 创建密钥
 */
export function createSecret(request: CreateSecretRequest): SecretValue {
  initSecretsStore();
  const db = initDb();
  const encryptionKey = getEncryptionKey();

  const id = uuidv4();
  const now = Date.now();
  const valueEncrypted = encrypt(request.value, encryptionKey);

  const stmt = db.prepare(`
    INSERT INTO ${SECRETS_TABLE} (
      id, provider, key, value_encrypted, type, description, expires_at,
      last_accessed_at, access_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    request.provider,
    request.key,
    valueEncrypted,
    request.type || 'api_key',
    request.description || null,
    request.expiresAt || null,
    null,
    0,
    now,
    now
  );

  logger.info('[SecretsStore] 密钥已创建', { id, provider: request.provider, key: request.key });

  // 记录访问日志
  logSecretAccess(id, 'system', 'write', true);

  return {
    id,
    provider: request.provider,
    key: request.key,
    type: request.type || 'api_key',
    valueEncrypted,
    createdAt: now,
    updatedAt: now,
    metadata: {
      description: request.description,
      expiresAt: request.expiresAt,
      accessCount: 0,
    },
  };
}

/**
 * 获取密钥（返回加密值，不暴露明文）
 */
export function getSecret(id: string): SecretValue | null {
  initSecretsStore();
  const db = initDb();

  const stmt = db.prepare(`
    SELECT id, provider, key, value_encrypted, type, description, expires_at,
           last_accessed_at, access_count, created_at, updated_at
    FROM ${SECRETS_TABLE}
    WHERE id = ?
  `);

  const row = stmt.get(id) as {
    id: string;
    provider: string;
    key: string;
    value_encrypted: string;
    type: string;
    description: string | null;
    expires_at: number | null;
    last_accessed_at: number | null;
    access_count: number;
    created_at: number;
    updated_at: number;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider as SecretProvider,
    key: row.key,
    type: row.type as SecretValue['type'],
    valueEncrypted: row.value_encrypted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: {
      description: row.description || undefined,
      expiresAt: row.expires_at || undefined,
      lastAccessedAt: row.last_accessed_at || undefined,
      accessCount: row.access_count,
    },
  };
}

/**
 * 解密并获取密钥值
 */
export function getSecretValue(id: string, source: string = 'unknown'): string | null {
  initSecretsStore();
  const db = initDb();
  const encryptionKey = getEncryptionKey();

  const stmt = db.prepare(`
    SELECT value_encrypted FROM ${SECRETS_TABLE} WHERE id = ?
  `);

  const row = stmt.get(id) as { value_encrypted: string } | undefined;

  if (!row) {
    logSecretAccess(id, source, 'read', false, '密钥不存在');
    return null;
  }

  try {
    const value = decrypt(row.value_encrypted, encryptionKey);

    // 更新访问统计
    db.prepare(`
      UPDATE ${SECRETS_TABLE}
      SET last_accessed_at = ?, access_count = access_count + 1
      WHERE id = ?
    `).run(Date.now(), id);

    logSecretAccess(id, source, 'read', true);
    return value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logSecretAccess(id, source, 'read', false, errorMessage);
    logger.error('[SecretsStore] 解密密钥失败', { id, error: errorMessage });
    return null;
  }
}

/**
 * 根据 provider 和 key 获取密钥值
 */
export function getSecretValueByKey(
  provider: SecretProvider,
  key: string,
  source: string = 'unknown'
): string | null {
  initSecretsStore();
  const db = initDb();

  const stmt = db.prepare(`
    SELECT id FROM ${SECRETS_TABLE} WHERE provider = ? AND key = ?
  `);

  const row = stmt.get(provider, key) as { id: string } | undefined;

  if (!row) return null;

  return getSecretValue(row.id, source);
}

/**
 * 更新密钥
 */
export function updateSecret(id: string, request: UpdateSecretRequest): SecretValue | null {
  initSecretsStore();
  const db = initDb();
  const encryptionKey = getEncryptionKey();

  const existing = getSecret(id);
  if (!existing) return null;

  const now = Date.now();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (request.value !== undefined) {
    updates.push('value_encrypted = ?');
    values.push(encrypt(request.value, encryptionKey));
  }

  if (request.type !== undefined) {
    updates.push('type = ?');
    values.push(request.type);
  }

  if (request.description !== undefined) {
    updates.push('description = ?');
    values.push(request.description || null);
  }

  if (request.expiresAt !== undefined) {
    updates.push('expires_at = ?');
    values.push(request.expiresAt || null);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  const stmt = db.prepare(`
    UPDATE ${SECRETS_TABLE}
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...values);

  logger.info('[SecretsStore] 密钥已更新', { id });
  logSecretAccess(id, 'system', 'write', true);

  return getSecret(id);
}

/**
 * 删除密钥
 */
export function deleteSecret(id: string): boolean {
  initSecretsStore();
  const db = initDb();

  const existing = getSecret(id);
  if (!existing) return false;

  db.prepare(`DELETE FROM ${SECRETS_TABLE} WHERE id = ?`).run(id);

  logger.info('[SecretsStore] 密钥已删除', { id });
  logSecretAccess(id, 'system', 'delete', true);

  return true;
}

/**
 * 列出所有密钥（不包含明文值）
 */
export function listSecrets(provider?: SecretProvider): Omit<SecretValue, 'valueEncrypted'>[] {
  initSecretsStore();
  const db = initDb();

  let stmt;
  if (provider) {
    stmt = db.prepare(`
      SELECT id, provider, key, type, description, expires_at,
             last_accessed_at, access_count, created_at, updated_at
      FROM ${SECRETS_TABLE}
      WHERE provider = ?
      ORDER BY created_at DESC
    `);
  } else {
    stmt = db.prepare(`
      SELECT id, provider, key, type, description, expires_at,
             last_accessed_at, access_count, created_at, updated_at
      FROM ${SECRETS_TABLE}
      ORDER BY created_at DESC
    `);
  }

  const rows = provider ? stmt.all(provider) : stmt.all();

  return (rows as Array<{
    id: string;
    provider: string;
    key: string;
    type: string;
    description: string | null;
    expires_at: number | null;
    last_accessed_at: number | null;
    access_count: number;
    created_at: number;
    updated_at: number;
  }>).map((row) => ({
    id: row.id,
    provider: row.provider as SecretProvider,
    key: row.key,
    type: row.type as SecretValue['type'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: {
      description: row.description || undefined,
      expiresAt: row.expires_at || undefined,
      lastAccessedAt: row.last_accessed_at || undefined,
      accessCount: row.access_count,
    },
  }));
}

/**
 * 记录密钥访问日志
 */
export function logSecretAccess(
  secretId: string,
  source: string,
  action: 'read' | 'write' | 'delete',
  success: boolean,
  errorMessage?: string
): void {
  initSecretsStore();
  const db = initDb();

  const stmt = db.prepare(`
    INSERT INTO ${SECRETS_ACCESS_LOG_TABLE} (
      id, secret_id, accessed_at, source, action, success, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    uuidv4(),
    secretId,
    Date.now(),
    source,
    action,
    success ? 1 : 0,
    errorMessage || null
  );
}

/**
 * 获取密钥访问日志
 */
export function getSecretAccessLogs(
  secretId?: string,
  limit: number = 100
): SecretAccessLog[] {
  initSecretsStore();
  const db = initDb();

  let stmt;
  if (secretId) {
    stmt = db.prepare(`
      SELECT id, secret_id, accessed_at, source, action, success, error_message
      FROM ${SECRETS_ACCESS_LOG_TABLE}
      WHERE secret_id = ?
      ORDER BY accessed_at DESC
      LIMIT ?
    `);
  } else {
    stmt = db.prepare(`
      SELECT id, secret_id, accessed_at, source, action, success, error_message
      FROM ${SECRETS_ACCESS_LOG_TABLE}
      ORDER BY accessed_at DESC
      LIMIT ?
    `);
  }

  const rows = secretId ? stmt.all(secretId, limit) : stmt.all(limit);

  return (rows as Array<{
    id: string;
    secret_id: string;
    accessed_at: number;
    source: string;
    action: string;
    success: number;
    error_message: string | null;
  }>).map((row) => ({
    id: row.id,
    secretId: row.secret_id,
    accessedAt: row.accessed_at,
    source: row.source,
    action: row.action as 'read' | 'write' | 'delete',
    success: row.success === 1,
    errorMessage: row.error_message || undefined,
  }));
}

/**
 * 清理过期的密钥
 */
export function cleanupExpiredSecrets(): number {
  initSecretsStore();
  const db = initDb();
  const now = Date.now();

  const result = db.prepare(`
    DELETE FROM ${SECRETS_TABLE}
    WHERE expires_at IS NOT NULL AND expires_at < ?
  `).run(now);

  const deletedCount = result.changes;

  if (deletedCount > 0) {
    logger.info('[SecretsStore] 已清理过期密钥', { count: deletedCount });
  }

  return deletedCount;
}

/**
 * 检查密钥是否存在
 */
export function secretExists(provider: SecretProvider, key: string): boolean {
  initSecretsStore();
  const db = initDb();

  const stmt = db.prepare(`
    SELECT 1 FROM ${SECRETS_TABLE} WHERE provider = ? AND key = ?
  `);

  const row = stmt.get(provider, key);
  return !!row;
}