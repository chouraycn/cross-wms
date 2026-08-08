/**
 * StaffGeneralSkillDao — GeneralSkill CRUD
 *
 * 涉及表：sd_general_skills
 * GeneralSkill 为通用技能，存储 markdown 与可选附件文件清单。
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID, newStaffId, StaffIdPrefix } from '../../db-staff.js';
import type { GeneralSkillRow, GeneralSkillRead } from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

function safeJsonArray(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObj(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

export function toGeneralSkillRead(row: GeneralSkillRow): GeneralSkillRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    homepage: row.homepage,
    skill_markdown: row.skill_markdown,
    skill_files: safeJsonArray(row.skill_files_json),
    metadata: safeJsonObj(row.metadata_json),
    status: row.status,
    permissions: safeJsonObj(row.permissions_json),
    runtime_config: safeJsonObj(row.runtime_config_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface GeneralSkillListFilter {
  tenantId?: string;
  status?: string;
  search?: string;
}

export function listGeneralSkills(filter: GeneralSkillListFilter = {}): GeneralSkillRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.search && filter.search.trim() !== '') {
    conditions.push('(name LIKE ? OR slug LIKE ? OR description LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
  }
  const sql = `SELECT * FROM sd_general_skills WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`;
  return db.prepare(sql).all(...params) as GeneralSkillRow[];
}

export function getGeneralSkillBySlug(
  tenantId: string,
  slug: string,
): GeneralSkillRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_general_skills WHERE tenant_id = ? AND slug = ?`)
    .get(tenantId, slug) as GeneralSkillRow | undefined;
}

export function getGeneralSkillById(id: string): GeneralSkillRow | undefined {
  const db = initDb();
  return db.prepare(`SELECT * FROM sd_general_skills WHERE id = ?`).get(id) as GeneralSkillRow | undefined;
}

export interface GeneralSkillInput {
  tenant_id?: string;
  slug: string;
  name: string;
  description?: string | null;
  homepage?: string | null;
  skill_markdown: string;
  skill_files?: any[];
  metadata?: Record<string, any>;
  status?: string;
  permissions?: Record<string, any>;
  runtime_config?: Record<string, any>;
}

export function createGeneralSkill(input: GeneralSkillInput): GeneralSkillRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.generalSkill);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_general_skills
       (id, tenant_id, slug, name, description, homepage, skill_markdown,
        skill_files_json, metadata_json, status, permissions_json, runtime_config_json,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.slug,
    input.name,
    input.description ?? null,
    input.homepage ?? null,
    input.skill_markdown,
    JSON.stringify(input.skill_files ?? []),
    JSON.stringify(input.metadata ?? {}),
    input.status ?? 'draft',
    JSON.stringify(input.permissions ?? {}),
    JSON.stringify(input.runtime_config ?? {}),
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_general_skills WHERE id = ?`).get(id) as GeneralSkillRow;
}

export interface GeneralSkillUpdateInput {
  name?: string;
  description?: string | null;
  homepage?: string | null;
  skill_markdown?: string;
  skill_files?: any[];
  metadata?: Record<string, any>;
  status?: string;
  permissions?: Record<string, any>;
  runtime_config?: Record<string, any>;
}

export function updateGeneralSkill(
  tenantId: string,
  slug: string,
  patch: GeneralSkillUpdateInput,
): GeneralSkillRow | null {
  const db = initDb();
  const existing = getGeneralSkillBySlug(tenantId, slug);
  if (!existing) return null;
  const ts = now();
  const next: GeneralSkillRow = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    homepage: patch.homepage !== undefined ? patch.homepage : existing.homepage,
    skill_markdown: patch.skill_markdown ?? existing.skill_markdown,
    skill_files_json:
      patch.skill_files !== undefined ? JSON.stringify(patch.skill_files) : existing.skill_files_json,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    status: patch.status ?? existing.status,
    permissions_json:
      patch.permissions !== undefined ? JSON.stringify(patch.permissions) : existing.permissions_json,
    runtime_config_json:
      patch.runtime_config !== undefined
        ? JSON.stringify(patch.runtime_config)
        : existing.runtime_config_json,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_general_skills
     SET name = ?, description = ?, homepage = ?, skill_markdown = ?, skill_files_json = ?,
         metadata_json = ?, status = ?, permissions_json = ?, runtime_config_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.name,
    next.description,
    next.homepage,
    next.skill_markdown,
    next.skill_files_json,
    next.metadata_json,
    next.status,
    next.permissions_json,
    next.runtime_config_json,
    next.updated_at,
    existing.id,
  );
  return next;
}

export function deleteGeneralSkill(tenantId: string, slug: string): boolean {
  const db = initDb();
  const existing = getGeneralSkillBySlug(tenantId, slug);
  if (!existing) return false;
  db.prepare(`DELETE FROM sd_general_skills WHERE id = ?`).run(existing.id);
  return true;
}
