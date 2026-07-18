/**
 * 密钥存储模块
 *
 * 基于 SQLite + AES-256-GCM 实现加密存储，支持：
 * - 索引查询（provider / key / scope / tags）
 * - 访问统计
 * - 缓存失效通知
 * - 过期清理
 *
 * 使用独立的 secrets_v2 表，与现有 secretsStore.ts 的 secrets 表隔离，
 * 互不干扰。两套表可并行使用，新模块面向未来更深层的密钥管理需求。
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../../db.js';
import { logger } from '../../logger.js';
import { encrypt, decrypt, getMasterKey } from './encryption.js';
import type {
  SecretValue,
  SecretRecord,
  SecretAccessLog,
  SecretAccessAction,
  CreateSecretRequest,
  UpdateSecretRequest,
  SecretProvider,
  SecretScope,
} from './types.js';

const SECRETS_TABLE = 'secrets_v2';
const ACCESS_LOG_TABLE = 'secrets_v2_access_log';

let storeInitialized = false;

/** 缓存失效回调 */
type InvalidateCallback = (provider: SecretProvider, key: string) => void;
const invalidateCallbacks: InvalidateCallback[] = [];

/**
 * 初始化密钥存储表
 */
export function initSecretsStore(): void {
  if (storeInitialized) return;
  const db = initDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SECRETS_TABLE} (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      key TEXT NOT NULL,
      value_encrypted TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      expires_at INTEGER,
      last_accessed_at INTEGER,
      access_count INTEGER DEFAULT 0,
      tags TEXT,
      scope TEXT,
      scope_id TEXT,
      rotation_policy_id TEXT,
      last_rotated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${ACCESS_LOG_TABLE} (
      id TEXT PRIMARY KEY,
      secret_id TEXT NOT NULL,
      accessed_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_provider_key ON ${SECRETS_TABLE}(provider, key);
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_scope ON ${SECRETS_TABLE}(scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_expires ON ${SECRETS_TABLE}(expires_at);
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_access_log_secret ON ${ACCESS_LOG_TABLE}(secret_id);
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_access_log_at ON ${ACCESS_LOG_TABLE}(accessed_at);
  `);

  storeInitialized = true;
  logger.info('[SecretsV2Store] 密钥存储表已初始化');
}

/**
 * 注册缓存失效回调
 */
export function onCacheInvalidate(cb: InvalidateCallback): void {
  invalidateCallbacks.push(cb);
}

/**
 * 通知缓存失效
 */
function notifyInvalidate(provider: SecretProvider, key: string): void {
  for (const cb of invalidateCallbacks) {
    try {
      cb(provider, key);
    } catch (e) {
      logger.warn('[SecretsV2Store] 缓存失效回调异常', { error: String(e) });
    }
  }
}

/**
 * 清理密钥存储（仅用于测试）
 */
export function clearSecretsStoreForTests(): void {
  initSecretsStore();
  const db = initDb();
  db.exec(`DELETE FROM ${ACCESS_LOG_TABLE}`);
  db.exec(`DELETE FROM ${SECRETS_TABLE}`);
}

/**
 * 按密钥 key 前缀清理密钥及其访问日志（仅用于测试隔离）
 *
 * 用于并行测试场景：每个测试文件使用唯一前缀，仅清理自己的数据，
 * 避免不同测试文件之间因清空整张表而产生竞争条件。
 */
export function deleteSecretsByKeyPrefixForTests(prefix: string): void {
  initSecretsStore();
  const db = initDb();
  // 先查出匹配的 secret id，再清理其访问日志，最后删除密钥本身
  const rows = db.prepare(`SELECT id FROM ${SECRETS_TABLE} WHERE key LIKE ?`).all(`${prefix}%`) as
    | { id: string }[]
    | undefined;
  const ids = (rows ?? []).map(r => r.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM ${ACCESS_LOG_TABLE} WHERE secret_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM ${SECRETS_TABLE} WHERE key LIKE ?`).run(`${prefix}%`);
  }
}

/** 数据库行类型 */
interface SecretRow {
  id: string;
  provider: string;
  key: string;
  value_encrypted: string;
  type: string;
  description: string | null;
  expires_at: number | null;
  last_accessed_at: number | null;
  access_count: number;
  tags: string | null;
  scope: string | null;
  scope_id: string | null;
  rotation_policy_id: string | null;
  last_rotated_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * 将数据库行转换为 SecretValue
 */
function rowToSecretValue(row: SecretRow): SecretValue {
  return {
    id: row.id,
    provider: row.provider as SecretProvider,
    key: row.key,
    type: row.type as SecretValue['type'],
    valueEncrypted: row.value_encrypted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scope: (row.scope ?? undefined) as SecretScope | undefined,
    scopeId: row.scope_id ?? undefined,
    metadata: {
      description: row.description ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      lastAccessedAt: row.last_accessed_at ?? undefined,
      accessCount: row.access_count,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      rotationPolicyId: row.rotation_policy_id ?? undefined,
      lastRotatedAt: row.last_rotated_at ?? undefined,
    },
  };
}

/**
 * 将数据库行转换为 SecretRecord（不含密文）
 */
function rowToSecretRecord(row: SecretRow): SecretRecord {
  const value = rowToSecretValue(row);
  const { valueEncrypted: _unused, ...record } = value;
  return record;
}

/**
 * 创建密钥
 */
export function createSecret(request: CreateSecretRequest): SecretValue {
  initSecretsStore();
  const db = initDb();
  const key = getMasterKey();

  const id = uuidv4();
  const now = Date.now();
  const valueEncrypted = encrypt(request.value, key);

  db.prepare(`
    INSERT INTO ${SECRETS_TABLE} (
      id, provider, key, value_encrypted, type, description, expires_at,
      last_accessed_at, access_count, tags, scope, scope_id,
      rotation_policy_id, last_rotated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    request.provider,
    request.key,
    valueEncrypted,
    request.type ?? 'other',
    request.description ?? null,
    request.expiresAt ?? null,
    null,
    0,
    request.tags ? JSON.stringify(request.tags) : null,
    request.scope ?? null,
    request.scopeId ?? null,
    null,
    null,
    now,
    now,
  );

  logSecretAccess(id, 'system', 'write', true);
  notifyInvalidate(request.provider, request.key);

  return {
    id,
    provider: request.provider,
    key: request.key,
    type: request.type ?? 'other',
    valueEncrypted,
    createdAt: now,
    updatedAt: now,
    scope: request.scope,
    scopeId: request.scopeId,
    metadata: {
      description: request.description,
      expiresAt: request.expiresAt,
      tags: request.tags,
      accessCount: 0,
    },
  };
}

/**
 * 获取密钥元数据（含密文，不返回明文）
 */
export function getSecret(id: string): SecretValue | null {
  initSecretsStore();
  const db = initDb();
  const row = db.prepare(`SELECT * FROM ${SECRETS_TABLE} WHERE id = ?`).get(id) as SecretRow | undefined;
  return row ? rowToSecretValue(row) : null;
}

/**
 * 解密并获取密钥值
 */
export function getSecretValue(id: string, source: string = 'unknown'): string | null {
  initSecretsStore();
  const db = initDb();
  const key = getMasterKey();

  const row = db.prepare(`SELECT value_encrypted FROM ${SECRETS_TABLE} WHERE id = ?`).get(id) as
    | { value_encrypted: string }
    | undefined;

  if (!row) {
    logSecretAccess(id, source, 'read', false, '密钥不存在');
    return null;
  }

  try {
    const value = decrypt(row.value_encrypted, key);
    db.prepare(`
      UPDATE ${SECRETS_TABLE}
      SET last_accessed_at = ?, access_count = access_count + 1
      WHERE id = ?
    `).run(Date.now(), id);
    logSecretAccess(id, source, 'read', true);
    return value;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logSecretAccess(id, source, 'read', false, msg);
    logger.error('[SecretsV2Store] 解密失败', { id, error: msg });
    return null;
  }
}

/**
 * 根据 provider + key 获取密钥值
 */
export function getSecretValueByKey(
  provider: SecretProvider,
  key: string,
  source: string = 'unknown',
): string | null {
  initSecretsStore();
  const db = initDb();
  const row = db.prepare(`SELECT id FROM ${SECRETS_TABLE} WHERE provider = ? AND key = ?`).get(provider, key) as
    | { id: string }
    | undefined;
  if (!row) return null;
  return getSecretValue(row.id, source);
}

/**
 * 更新密钥
 */
export function updateSecret(id: string, request: UpdateSecretRequest): SecretValue | null {
  initSecretsStore();
  const db = initDb();
  const existing = getSecret(id);
  if (!existing) return null;

  const key = getMasterKey();
  const now = Date.now();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (request.value !== undefined) {
    updates.push('value_encrypted = ?');
    values.push(encrypt(request.value, key));
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
  if (request.tags !== undefined) {
    updates.push('tags = ?');
    values.push(request.tags ? JSON.stringify(request.tags) : null);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE ${SECRETS_TABLE} SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  logSecretAccess(id, 'system', 'write', true);
  notifyInvalidate(existing.provider, existing.key);

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

  logSecretAccess(id, 'system', 'delete', true);
  db.prepare(`DELETE FROM ${SECRETS_TABLE} WHERE id = ?`).run(id);
  notifyInvalidate(existing.provider, existing.key);

  return true;
}

/**
 * 检查密钥是否存在
 */
export function secretExists(provider: SecretProvider, key: string): boolean {
  initSecretsStore();
  const db = initDb();
  const row = db.prepare(`SELECT 1 FROM ${SECRETS_TABLE} WHERE provider = ? AND key = ?`).get(provider, key);
  return !!row;
}

/**
 * 列出密钥（不含密文）
 */
export function listSecrets(filter?: {
  provider?: SecretProvider;
  scope?: SecretScope;
  scopeId?: string;
  tag?: string;
}): SecretRecord[] {
  initSecretsStore();
  const db = initDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter?.provider) {
    conditions.push('provider = ?');
    params.push(filter.provider);
  }
  if (filter?.scope) {
    conditions.push('scope = ?');
    params.push(filter.scope);
  }
  if (filter?.scopeId) {
    conditions.push('scope_id = ?');
    params.push(filter.scopeId);
  }
  if (filter?.tag) {
    conditions.push("tags LIKE ?");
    params.push(`%"${filter.tag}"%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM ${SECRETS_TABLE} ${where} ORDER BY created_at DESC`).all(...params) as SecretRow[];

  return rows.map(rowToSecretRecord);
}

/**
 * 记录访问日志
 */
export function logSecretAccess(
  secretId: string,
  source: string,
  action: SecretAccessAction,
  success: boolean,
  errorMessage?: string,
): void {
  initSecretsStore();
  const db = initDb();
  db.prepare(`
    INSERT INTO ${ACCESS_LOG_TABLE} (id, secret_id, accessed_at, source, action, success, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), secretId, Date.now(), source, action, success ? 1 : 0, errorMessage ?? null);
}

/**
 * 获取访问日志
 */
export function getSecretAccessLogs(secretId?: string, limit: number = 100): SecretAccessLog[] {
  initSecretsStore();
  const db = initDb();

  let stmt;
  let rows: Array<{
    id: string;
    secret_id: string;
    accessed_at: number;
    source: string;
    action: string;
    success: number;
    error_message: string | null;
  }>;

  if (secretId) {
    stmt = db.prepare(`SELECT * FROM ${ACCESS_LOG_TABLE} WHERE secret_id = ? ORDER BY accessed_at DESC LIMIT ?`);
    rows = stmt.all(secretId, limit) as typeof rows;
  } else {
    stmt = db.prepare(`SELECT * FROM ${ACCESS_LOG_TABLE} ORDER BY accessed_at DESC LIMIT ?`);
    rows = stmt.all(limit) as typeof rows;
  }

  return rows.map(row => ({
    id: row.id,
    secretId: row.secret_id,
    accessedAt: row.accessed_at,
    source: row.source,
    action: row.action as SecretAccessAction,
    success: row.success === 1,
    errorMessage: row.error_message ?? undefined,
  }));
}

/**
 * 清理过期密钥
 */
export function cleanupExpiredSecrets(): number {
  initSecretsStore();
  const db = initDb();
  const now = Date.now();
  const result = db.prepare(`DELETE FROM ${SECRETS_TABLE} WHERE expires_at IS NOT NULL AND expires_at < ?`).run(now);
  return result.changes;
}

/**
 * 标记密钥已轮换
 */
export function markRotated(id: string): void {
  initSecretsStore();
  const db = initDb();
  db.prepare(`UPDATE ${SECRETS_TABLE} SET last_rotated_at = ?, updated_at = ? WHERE id = ?`).run(
    Date.now(),
    Date.now(),
    id,
  );
}
