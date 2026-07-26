/**
 * StaffPersonaDao — sd_persona_configs 表 CRUD（单租户单行）
 *
 * 设计：
 * - tenant_id 为主键，每个租户仅一行配置
 * - 时间字段使用 INTEGER（Unix 秒）
 * - 默认配置在 db-staff.ts 初始化时已创建，此处 getOrCreate 兜底
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { PersonaConfigRow, PersonaConfigRead } from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

const DEFAULT_PERSONA_PROMPT = 'You are a helpful assistant.';

/** row -> read */
export function toPersonaRead(row: PersonaConfigRow): PersonaConfigRead {
  return {
    tenant_id: row.tenant_id,
    system_prompt: row.system_prompt,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 获取或创建 Persona 配置（幂等） */
export function getOrCreatePersona(
  tenantId: string = DEFAULT_TENANT_ID,
): PersonaConfigRow {
  const db = initDb();
  const existing = db
    .prepare('SELECT * FROM sd_persona_configs WHERE tenant_id = ?')
    .get(tenantId) as PersonaConfigRow | undefined;
  if (existing) return existing;

  const ts = now();
  db.prepare(
    'INSERT INTO sd_persona_configs (tenant_id, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(tenantId, DEFAULT_PERSONA_PROMPT, ts, ts);
  return db
    .prepare('SELECT * FROM sd_persona_configs WHERE tenant_id = ?')
    .get(tenantId) as PersonaConfigRow;
}

/** 更新 Persona 配置的 system_prompt */
export function updatePersona(
  tenantId: string,
  systemPrompt: string,
): PersonaConfigRow | null {
  const db = initDb();
  const existing = db
    .prepare('SELECT * FROM sd_persona_configs WHERE tenant_id = ?')
    .get(tenantId) as PersonaConfigRow | undefined;
  const ts = now();
  if (!existing) {
    db.prepare(
      'INSERT INTO sd_persona_configs (tenant_id, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(tenantId, systemPrompt, ts, ts);
    return db
      .prepare('SELECT * FROM sd_persona_configs WHERE tenant_id = ?')
      .get(tenantId) as PersonaConfigRow;
  }
  db.prepare(
    'UPDATE sd_persona_configs SET system_prompt = ?, updated_at = ? WHERE tenant_id = ?',
  ).run(systemPrompt, ts, tenantId);
  return { ...existing, system_prompt: systemPrompt, updated_at: ts };
}
