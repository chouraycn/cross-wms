/**
 * API Credentials Data Access Object — API 凭证数据访问层
 *
 * v3.0: 封装 api_credentials 表的所有 CRUD 操作
 * + 使用 credentialService 进行 AES-256-GCM 加密/解密
 * + 列表/详情接口不返回明文值，仅返回 has_value 布尔标记
 */

import { initDb, type ApiCredentialRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { encryptCredential, decryptCredential } from '../services/credentialService.js';

// ===================== Safe View Type (不含明文值) =====================

export interface ApiCredentialSafe {
  id: string;
  name: string;
  credential_type: string;
  domain: string;
  header_name: string;
  expires_at: string | null;
  has_value: boolean;
  created_at: string;
  updated_at: string;
}

// ===================== Helpers =====================

/** 将数据库行转换为安全视图（不暴露加密值） */
function toSafeView(row: ApiCredentialRow): ApiCredentialSafe {
  return {
    id: row.id,
    name: row.name,
    credential_type: row.credential_type,
    domain: row.domain,
    header_name: row.header_name,
    expires_at: row.expires_at,
    has_value: row.encrypted_value !== '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===================== Public DAO Functions =====================

/**
 * 列出所有凭证（不返回明文值）。
 * 可选按 domain 过滤。
 */
export function listCredentials(domain?: string): ApiCredentialSafe[] {
  const db = initDb();
  let rows: ApiCredentialRow[];
  if (domain && domain.trim() !== '') {
    rows = db.prepare(
      'SELECT * FROM api_credentials WHERE domain = ? ORDER BY updated_at DESC'
    ).all(domain.trim()) as ApiCredentialRow[];
  } else {
    rows = db.prepare(
      'SELECT * FROM api_credentials ORDER BY updated_at DESC'
    ).all() as ApiCredentialRow[];
  }
  return rows.map(toSafeView);
}

/**
 * 获取单个凭证详情（不返回明文值）。
 */
export function getCredential(id: string): ApiCredentialSafe | null {
  const db = initDb();
  const row = db.prepare('SELECT * FROM api_credentials WHERE id = ?').get(id) as ApiCredentialRow | undefined;
  if (!row) return null;
  return toSafeView(row);
}

/**
 * 获取凭证的解密值（用于运行时注入）。
 */
export function getCredentialValue(id: string): string | null {
  const db = initDb();
  const row = db.prepare('SELECT encrypted_value, iv, auth_tag FROM api_credentials WHERE id = ?').get(id) as
    | { encrypted_value: string; iv: string; auth_tag: string }
    | undefined;
  if (!row || !row.encrypted_value) return null;

  try {
    // auth_tag 字段存储在数据库中，拼接后用于解密
    // encrypted_value 在数据库中只存密文部分，auth_tag 单独存储
    const fullEncrypted = row.encrypted_value + row.auth_tag;
    return decryptCredential(fullEncrypted, row.iv);
  } catch {
    console.warn(`[CredentialService] 解密凭证失败: ${id}`);
    return null;
  }
}

/**
 * 创建新凭证。
 * 明文 value 会被 AES-256-GCM 加密后存储。
 */
export function createCredential(data: {
  name: string;
  credentialType: string;
  value: string;
  domain: string;
  headerName?: string;
  metadata?: Record<string, string>;
}): ApiCredentialSafe {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  // 加密凭证值
  const { encrypted, iv } = encryptCredential(data.value);
  // 密文和 auth tag 分开存储：encrypted 包含密文+tag，前半部分是密文，后 32 hex 是 tag
  const authTag = encrypted.slice(-32);
  const encryptedData = encrypted.slice(0, -32);

  // 验证 credential_type
  const validTypes = ['api_key', 'bearer_token', 'basic_auth', 'oauth2', 'custom_header'];
  const credentialType = validTypes.includes(data.credentialType) ? data.credentialType : 'api_key';

  db.prepare(
    `INSERT INTO api_credentials (id, name, credential_type, encrypted_value, iv, auth_tag, domain, header_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name.trim(),
    credentialType,
    encryptedData,
    iv,
    authTag,
    data.domain.trim(),
    data.headerName || 'Authorization',
    now,
    now,
  );

  const row = db.prepare('SELECT * FROM api_credentials WHERE id = ?').get(id) as ApiCredentialRow;
  return toSafeView(row);
}

/**
 * 更新已有凭证。
 * 如果提供新 value，会重新加密。
 */
export function updateCredential(
  id: string,
  data: Partial<{
    name: string;
    value: string;
    domain: string;
    headerName: string;
    credentialType: string;
  }>,
): ApiCredentialSafe | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM api_credentials WHERE id = ?').get(id) as ApiCredentialRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (data.name && typeof data.name === 'string') {
    updates.push('name = ?');
    params.push(data.name.trim());
  }

  if (data.domain && typeof data.domain === 'string') {
    updates.push('domain = ?');
    params.push(data.domain.trim());
  }

  if (data.headerName && typeof data.headerName === 'string') {
    updates.push('header_name = ?');
    params.push(data.headerName.trim());
  }

  if (data.credentialType && typeof data.credentialType === 'string') {
    const validTypes = ['api_key', 'bearer_token', 'basic_auth', 'oauth2', 'custom_header'];
    if (validTypes.includes(data.credentialType)) {
      updates.push('credential_type = ?');
      params.push(data.credentialType);
    }
  }

  // 如果提供了新 value，重新加密
  if (data.value && typeof data.value === 'string') {
    const { encrypted, iv } = encryptCredential(data.value);
    const authTag = encrypted.slice(-32);
    const encryptedData = encrypted.slice(0, -32);
    updates.push('encrypted_value = ?');
    params.push(encryptedData);
    updates.push('iv = ?');
    params.push(iv);
    updates.push('auth_tag = ?');
    params.push(authTag);
  }

  params.push(id);
  db.prepare(`UPDATE api_credentials SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const row = db.prepare('SELECT * FROM api_credentials WHERE id = ?').get(id) as ApiCredentialRow;
  return toSafeView(row);
}

/**
 * 删除凭证。
 */
export function deleteCredential(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM api_credentials WHERE id = ?').run(id);
  return result.changes > 0;
}
