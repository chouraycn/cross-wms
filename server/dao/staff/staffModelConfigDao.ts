/**
 * StaffDeck Model Config DAO — sd_model_configs CRUD
 *
 * 注意 is_default 字段：通过部分唯一索引 uq_sd_model_configs_tenant_default
 * 保证每个 tenant 只能有一个 is_default=1 的配置。set-default 时先清零再置一。
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { ModelConfigRow } from '../../types/staff.js';

// ===================== 查询 =====================

/** 列出某租户下的全部模型配置 */
export function listModelConfigs(tenantId: string = DEFAULT_TENANT_ID): ModelConfigRow[] {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_model_configs WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(tenantId) as ModelConfigRow[];
}

/** 按 ID 获取单个模型配置 */
export function getModelConfigById(
  tenantId: string = DEFAULT_TENANT_ID,
  configId: string,
): ModelConfigRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_model_configs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, configId) as ModelConfigRow | undefined;
}

/** 获取租户的默认模型配置 */
export function getDefaultModelConfig(tenantId: string = DEFAULT_TENANT_ID): ModelConfigRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_model_configs WHERE tenant_id = ? AND is_default = 1')
    .get(tenantId) as ModelConfigRow | undefined;
}

/** 是否存在已启用或默认的模型 */
export function hasAvailableModel(tenantId: string = DEFAULT_TENANT_ID): boolean {
  const db = initDb();
  const row = db
    .prepare('SELECT id FROM sd_model_configs WHERE tenant_id = ? AND (enabled = 1 OR is_default = 1) LIMIT 1')
    .get(tenantId) as { id: string } | undefined;
  return row !== undefined;
}

// ===================== 写入 =====================

interface CreateModelConfigData {
  tenant_id?: string;
  name: string;
  provider?: string;
  api_protocol?: string;
  base_url?: string | null;
  api_key_encrypted: string;
  model: string;
  temperature?: number;
  max_output_tokens?: number;
  extra_body?: Record<string, unknown>;
  protocol_options?: Record<string, unknown>;
  legacy_unmapped_options?: Record<string, unknown>;
  trust_status?: string;
  enabled?: boolean;
  is_default?: boolean;
}

/** 创建模型配置 */
export function createModelConfig(data: CreateModelConfigData): ModelConfigRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.modelConfig);
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  db.prepare(
    `INSERT INTO sd_model_configs (
      id, tenant_id, name, provider, api_protocol, base_url, api_key_encrypted,
      model, temperature, max_output_tokens, extra_body_json, protocol_options_json,
      legacy_unmapped_options_json, trust_status, verified_at, verified_fingerprint,
      verification_attempt_id, verification_started_at, verification_attempt_status,
      verification_attempt_error_code, config_revision, security_revision, key_revision,
      is_default, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'idle', NULL, 1, 1, 1, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.name,
    data.provider || 'openai_compatible',
    data.api_protocol || 'openai_chat_completions',
    data.base_url ?? null,
    data.api_key_encrypted,
    data.model,
    data.temperature ?? 0.2,
    data.max_output_tokens ?? 8192,
    JSON.stringify(data.extra_body ?? {}),
    JSON.stringify(data.protocol_options ?? {}),
    JSON.stringify(data.legacy_unmapped_options ?? {}),
    data.trust_status || 'unverified',
    data.is_default ? 1 : 0,
    data.enabled ? 1 : 0,
  );
  return db.prepare('SELECT * FROM sd_model_configs WHERE id = ?').get(id) as ModelConfigRow;
}

interface UpdateModelConfigData {
  name?: string;
  provider?: string;
  api_protocol?: string;
  base_url?: string | null;
  api_key_encrypted?: string;
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
  extra_body?: Record<string, unknown>;
  protocol_options?: Record<string, unknown>;
  legacy_unmapped_options?: Record<string, unknown>;
  trust_status?: string;
  verified_at?: number | null;
  verified_fingerprint?: string | null;
  verification_attempt_id?: string | null;
  verification_started_at?: number | null;
  verification_attempt_status?: string;
  verification_attempt_error_code?: string | null;
  config_revision?: number;
  security_revision?: number;
  key_revision?: number;
  is_default?: boolean;
  enabled?: boolean;
}

/** 更新模型配置（部分更新） */
export function updateModelConfig(
  tenantId: string = DEFAULT_TENANT_ID,
  configId: string,
  updates: UpdateModelConfigData,
): ModelConfigRow | undefined {
  const db = initDb();
  const existing = getModelConfigById(tenantId, configId);
  if (!existing) return undefined;

  const setClauses: string[] = ['updated_at = CAST(strftime(\'%s\',\'now\') AS INTEGER)'];
  const params: unknown[] = [];

  if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
  if (updates.provider !== undefined) { setClauses.push('provider = ?'); params.push(updates.provider); }
  if (updates.api_protocol !== undefined) { setClauses.push('api_protocol = ?'); params.push(updates.api_protocol); }
  if (updates.base_url !== undefined) { setClauses.push('base_url = ?'); params.push(updates.base_url); }
  if (updates.api_key_encrypted !== undefined) { setClauses.push('api_key_encrypted = ?'); params.push(updates.api_key_encrypted); }
  if (updates.model !== undefined) { setClauses.push('model = ?'); params.push(updates.model); }
  if (updates.temperature !== undefined) { setClauses.push('temperature = ?'); params.push(updates.temperature); }
  if (updates.max_output_tokens !== undefined) { setClauses.push('max_output_tokens = ?'); params.push(updates.max_output_tokens); }
  if (updates.extra_body !== undefined) { setClauses.push('extra_body_json = ?'); params.push(JSON.stringify(updates.extra_body)); }
  if (updates.protocol_options !== undefined) { setClauses.push('protocol_options_json = ?'); params.push(JSON.stringify(updates.protocol_options)); }
  if (updates.legacy_unmapped_options !== undefined) { setClauses.push('legacy_unmapped_options_json = ?'); params.push(JSON.stringify(updates.legacy_unmapped_options)); }
  if (updates.trust_status !== undefined) { setClauses.push('trust_status = ?'); params.push(updates.trust_status); }
  if (updates.verified_at !== undefined) { setClauses.push('verified_at = ?'); params.push(updates.verified_at); }
  if (updates.verified_fingerprint !== undefined) { setClauses.push('verified_fingerprint = ?'); params.push(updates.verified_fingerprint); }
  if (updates.verification_attempt_id !== undefined) { setClauses.push('verification_attempt_id = ?'); params.push(updates.verification_attempt_id); }
  if (updates.verification_started_at !== undefined) { setClauses.push('verification_started_at = ?'); params.push(updates.verification_started_at); }
  if (updates.verification_attempt_status !== undefined) { setClauses.push('verification_attempt_status = ?'); params.push(updates.verification_attempt_status); }
  if (updates.verification_attempt_error_code !== undefined) { setClauses.push('verification_attempt_error_code = ?'); params.push(updates.verification_attempt_error_code); }
  if (updates.config_revision !== undefined) { setClauses.push('config_revision = ?'); params.push(updates.config_revision); }
  if (updates.security_revision !== undefined) { setClauses.push('security_revision = ?'); params.push(updates.security_revision); }
  if (updates.key_revision !== undefined) { setClauses.push('key_revision = ?'); params.push(updates.key_revision); }
  if (updates.is_default !== undefined) { setClauses.push('is_default = ?'); params.push(updates.is_default ? 1 : 0); }
  if (updates.enabled !== undefined) { setClauses.push('enabled = ?'); params.push(updates.enabled ? 1 : 0); }

  params.push(tenantId, configId);
  db.prepare(`UPDATE sd_model_configs SET ${setClauses.join(', ')} WHERE tenant_id = ? AND id = ?`).run(...params);
  return getModelConfigById(tenantId, configId);
}

/** 清除租户内所有 is_default 标记（用于 set-default 前置） */
export function clearDefault(tenantId: string = DEFAULT_TENANT_ID): void {
  const db = initDb();
  db.prepare(
    `UPDATE sd_model_configs SET is_default = 0, updated_at = CAST(strftime('%s','now') AS INTEGER) WHERE tenant_id = ? AND is_default = 1`,
  ).run(tenantId);
}

/** 设置指定配置为默认（先清除其他，再置一） */
export function setDefaultModelConfig(
  tenantId: string = DEFAULT_TENANT_ID,
  configId: string,
): ModelConfigRow | undefined {
  const db = initDb();
  const existing = getModelConfigById(tenantId, configId);
  if (!existing) return undefined;
  // 事务保证原子性
  const tx = db.transaction(() => {
    clearDefault(tenantId);
    db.prepare(
      `UPDATE sd_model_configs SET is_default = 1, updated_at = CAST(strftime('%s','now') AS INTEGER) WHERE tenant_id = ? AND id = ?`,
    ).run(tenantId, configId);
  });
  tx();
  return getModelConfigById(tenantId, configId);
}
