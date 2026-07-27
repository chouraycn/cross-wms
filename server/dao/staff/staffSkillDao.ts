/**
 * StaffSkillDao — Skill / SkillVersion / AgentSkillBranch(Version) CRUD
 *
 * 涉及表：sd_skills, sd_skill_versions, sd_agent_skill_branches, sd_agent_skill_branch_versions
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID, newStaffId, StaffIdPrefix } from '../../db-staff.js';
import type {
  SkillRow,
  SkillRead,
  SkillVersionRow,
  AgentSkillBranchRow,
  AgentSkillBranchVersionRow,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

// ===================== Skills =====================

export function toSkillRead(row: SkillRow): SkillRead {
  let content: Record<string, unknown> = {};
  try {
    content = row.content_json ? JSON.parse(row.content_json) : {};
  } catch {
    content = {};
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    skill_id: row.skill_id,
    version: row.version,
    name: row.name,
    business_domain: row.business_domain,
    description: row.description,
    content,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface SkillListFilter {
  tenantId?: string;
  status?: string;
  businessDomain?: string;
  search?: string;
}

export function listSkills(filter: SkillListFilter = {}): SkillRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.businessDomain) {
    conditions.push('business_domain = ?');
    params.push(filter.businessDomain);
  }
  if (filter.search && filter.search.trim() !== '') {
    conditions.push('(name LIKE ? OR description LIKE ? OR skill_id LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
  }
  const sql = `SELECT * FROM sd_skills WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`;
  return db.prepare(sql).all(...params) as SkillRow[];
}

export function getSkillBySkillId(
  tenantId: string,
  skillId: string,
): SkillRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_skills WHERE tenant_id = ? AND skill_id = ?`)
    .get(tenantId, skillId) as SkillRow | undefined;
}

export function getSkillById(id: string): SkillRow | undefined {
  const db = initDb();
  return db.prepare(`SELECT * FROM sd_skills WHERE id = ?`).get(id) as SkillRow | undefined;
}

export interface SkillCreateInput {
  tenant_id?: string;
  skill_id?: string;
  version?: string;
  name: string;
  business_domain?: string | null;
  description?: string | null;
  content?: Record<string, unknown>;
  status?: string;
}

export function createSkill(input: SkillCreateInput): SkillRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const skillId = input.skill_id ?? newStaffId(StaffIdPrefix.skill);
  const version = input.version ?? '1.0.0';
  const id = newStaffId(StaffIdPrefix.skillVersion);
  const ts = now();
  const contentJson = JSON.stringify(input.content ?? {});
  db.prepare(
    `INSERT INTO sd_skills
       (id, tenant_id, skill_id, version, name, business_domain, description, content_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    skillId,
    version,
    input.name,
    input.business_domain ?? null,
    input.description ?? null,
    contentJson,
    input.status ?? 'draft',
    ts,
    ts,
  );
  // 同步创建首个版本快照
  upsertSkillVersion({
    tenant_id: tenantId,
    skill_id: skillId,
    version,
    name: input.name,
    business_domain: input.business_domain ?? null,
    description: input.description ?? null,
    content: input.content ?? {},
    status: input.status ?? 'draft',
  });
  return db.prepare(`SELECT * FROM sd_skills WHERE id = ?`).get(id) as SkillRow;
}

export interface SkillUpdateInput {
  name?: string;
  business_domain?: string | null;
  description?: string | null;
  content?: Record<string, unknown>;
  status?: string;
  version?: string;
}

export function updateSkill(tenantId: string, skillId: string, patch: SkillUpdateInput): SkillRow | null {
  const db = initDb();
  const existing = getSkillBySkillId(tenantId, skillId);
  if (!existing) return null;
  const ts = now();
  const next: SkillRow = {
    ...existing,
    name: patch.name ?? existing.name,
    business_domain: patch.business_domain !== undefined ? patch.business_domain : existing.business_domain,
    description: patch.description !== undefined ? patch.description : existing.description,
    content_json: patch.content !== undefined ? JSON.stringify(patch.content) : existing.content_json,
    status: patch.status ?? existing.status,
    version: patch.version ?? existing.version,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_skills
     SET name = ?, business_domain = ?, description = ?, content_json = ?, status = ?, version = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.name,
    next.business_domain,
    next.description,
    next.content_json,
    next.status,
    next.version,
    next.updated_at,
    existing.id,
  );
  return next;
}

export function deleteSkill(tenantId: string, skillId: string): boolean {
  const db = initDb();
  const existing = getSkillBySkillId(tenantId, skillId);
  if (!existing) return false;
  // 级联清理 versions 与 branches
  db.prepare(`DELETE FROM sd_skill_versions WHERE tenant_id = ? AND skill_id = ?`).run(tenantId, skillId);
  db.prepare(`DELETE FROM sd_agent_skill_branches WHERE tenant_id = ? AND skill_id = ?`).run(tenantId, skillId);
  db.prepare(`DELETE FROM sd_agent_skill_branch_versions WHERE tenant_id = ? AND skill_id = ?`).run(tenantId, skillId);
  db.prepare(`DELETE FROM sd_skills WHERE id = ?`).run(existing.id);
  return true;
}

// ===================== Skill Versions =====================

export interface SkillVersionInput {
  tenant_id?: string;
  skill_id: string;
  version: string;
  name: string;
  business_domain?: string | null;
  description?: string | null;
  content?: Record<string, unknown>;
  status?: string;
}

export function listSkillVersions(tenantId: string, skillId: string): SkillVersionRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_skill_versions WHERE tenant_id = ? AND skill_id = ? ORDER BY created_at DESC`,
    )
    .all(tenantId, skillId) as SkillVersionRow[];
}

export function getSkillVersion(
  tenantId: string,
  skillId: string,
  version: string,
): SkillVersionRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_skill_versions WHERE tenant_id = ? AND skill_id = ? AND version = ?`)
    .get(tenantId, skillId, version) as SkillVersionRow | undefined;
}

export function upsertSkillVersion(input: SkillVersionInput): SkillVersionRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const existing = getSkillVersion(tenantId, input.skill_id, input.version);
  const ts = now();
  const contentJson = JSON.stringify(input.content ?? {});
  if (existing) {
    db.prepare(
      `UPDATE sd_skill_versions
       SET name = ?, business_domain = ?, description = ?, content_json = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.business_domain ?? null,
      input.description ?? null,
      contentJson,
      input.status ?? 'draft',
      ts,
      existing.id,
    );
    return { ...existing, name: input.name, content_json: contentJson, status: input.status ?? 'draft', updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.skillVersion);
  db.prepare(
    `INSERT INTO sd_skill_versions
       (id, tenant_id, skill_id, version, name, business_domain, description, content_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.skill_id,
    input.version,
    input.name,
    input.business_domain ?? null,
    input.description ?? null,
    contentJson,
    input.status ?? 'draft',
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_skill_versions WHERE id = ?`).get(id) as SkillVersionRow;
}

export function deleteSkillVersion(tenantId: string, skillId: string, version: string): boolean {
  const db = initDb();
  const r = db
    .prepare(`DELETE FROM sd_skill_versions WHERE tenant_id = ? AND skill_id = ? AND version = ?`)
    .run(tenantId, skillId, version);
  return r.changes > 0;
}

/** Rollback：将 sd_skills 主表回滚到指定 version 的快照 */
export function rollbackSkillToVersion(
  tenantId: string,
  skillId: string,
  version: string,
): SkillRow | null {
  const db = initDb();
  const target = getSkillVersion(tenantId, skillId, version);
  if (!target) return null;
  const ts = now();
  db.prepare(
    `UPDATE sd_skills
     SET version = ?, name = ?, business_domain = ?, description = ?, content_json = ?, status = ?, updated_at = ?
     WHERE tenant_id = ? AND skill_id = ?`,
  ).run(
    target.version,
    target.name,
    target.business_domain,
    target.description,
    target.content_json,
    target.status,
    ts,
    tenantId,
    skillId,
  );
  return getSkillBySkillId(tenantId, skillId) ?? null;
}

// ===================== Agent Skill Branches =====================

export function listAgentSkillBranches(
  tenantId: string,
  agentId: string,
): AgentSkillBranchRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_agent_skill_branches WHERE tenant_id = ? AND agent_id = ? ORDER BY updated_at DESC`,
    )
    .all(tenantId, agentId) as AgentSkillBranchRow[];
}

export function getAgentSkillBranch(
  tenantId: string,
  agentId: string,
  skillId: string,
): AgentSkillBranchRow | undefined {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_agent_skill_branches WHERE tenant_id = ? AND agent_id = ? AND skill_id = ?`,
    )
    .get(tenantId, agentId, skillId) as AgentSkillBranchRow | undefined;
}

export interface AgentSkillBranchInput {
  tenant_id?: string;
  agent_id: string;
  skill_id: string;
  source_skill_id: string;
  base_version?: string;
  head_version?: string;
  content?: Record<string, unknown>;
  status?: string;
  sync_state?: string;
  metadata?: Record<string, unknown>;
}

export function upsertAgentSkillBranch(input: AgentSkillBranchInput): AgentSkillBranchRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const existing = getAgentSkillBranch(tenantId, input.agent_id, input.skill_id);
  const ts = now();
  const contentJson = JSON.stringify(input.content ?? {});
  const metadataJson = JSON.stringify(input.metadata ?? {});
  if (existing) {
    db.prepare(
      `UPDATE sd_agent_skill_branches
       SET source_skill_id = ?, base_version = ?, head_version = ?, content_json = ?, status = ?, sync_state = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.source_skill_id,
      input.base_version ?? '1.0.0',
      input.head_version ?? '1.0.0',
      contentJson,
      input.status ?? 'active',
      input.sync_state ?? 'synced',
      metadataJson,
      ts,
      existing.id,
    );
    return { ...existing, content_json: contentJson, updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.agentSkillBranch);
  db.prepare(
    `INSERT INTO sd_agent_skill_branches
       (id, tenant_id, agent_id, skill_id, source_skill_id, base_version, head_version,
        content_json, status, sync_state, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.agent_id,
    input.skill_id,
    input.source_skill_id,
    input.base_version ?? '1.0.0',
    input.head_version ?? '1.0.0',
    contentJson,
    input.status ?? 'active',
    input.sync_state ?? 'synced',
    metadataJson,
    ts,
    ts,
  );
  return db
    .prepare(`SELECT * FROM sd_agent_skill_branches WHERE id = ?`)
    .get(id) as AgentSkillBranchRow;
}

export function deleteAgentSkillBranch(
  tenantId: string,
  agentId: string,
  skillId: string,
): boolean {
  const db = initDb();
  const r = db
    .prepare(
      `DELETE FROM sd_agent_skill_branches WHERE tenant_id = ? AND agent_id = ? AND skill_id = ?`,
    )
    .run(tenantId, agentId, skillId);
  return r.changes > 0;
}

// ===================== Agent Skill Branch Versions =====================

export function listAgentSkillBranchVersions(
  tenantId: string,
  agentId: string,
  skillId: string,
): AgentSkillBranchVersionRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_agent_skill_branch_versions
       WHERE tenant_id = ? AND agent_id = ? AND skill_id = ?
       ORDER BY created_at DESC`,
    )
    .all(tenantId, agentId, skillId) as AgentSkillBranchVersionRow[];
}

export function rollbackAgentSkillBranch(
  tenantId: string,
  agentId: string,
  skillId: string,
  version: string,
): AgentSkillBranchRow | null {
  const db = initDb();
  const target = db
    .prepare(
      `SELECT * FROM sd_agent_skill_branch_versions
       WHERE tenant_id = ? AND agent_id = ? AND skill_id = ? AND version = ?`,
    )
    .get(tenantId, agentId, skillId, version) as AgentSkillBranchVersionRow | undefined;
  if (!target) return null;
  const ts = now();
  db.prepare(
    `UPDATE sd_agent_skill_branches
     SET head_version = ?, content_json = ?, sync_state = 'diverged', updated_at = ?
     WHERE tenant_id = ? AND agent_id = ? AND skill_id = ?`,
  ).run(
    target.version,
    target.content_json,
    ts,
    tenantId,
    agentId,
    skillId,
  );
  return getAgentSkillBranch(tenantId, agentId, skillId) ?? null;
}

// ===================== 分支版本化：sync / promote / versions =====================
function parseBranchContent(json?: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
function incrementMinorVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '1.0.0');
  if (!m) return '1.0.1';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export interface AgentSkillBranchVersionInput {
  tenant_id?: string;
  agent_id: string;
  skill_id: string;
  source_skill_id?: string;
  version: string;
  base_version?: string;
  content?: Record<string, unknown>;
  status?: string;
  sync_state?: string;
  change_summary?: string;
}

export function upsertAgentSkillBranchVersion(
  input: AgentSkillBranchVersionInput,
): AgentSkillBranchVersionRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const ts = now();
  const id = newStaffId(StaffIdPrefix.agentSkillBranch);
  db.prepare(
    `INSERT INTO sd_agent_skill_branch_versions
       (id, tenant_id, agent_id, skill_id, source_skill_id, version, base_version, content_json, status, sync_state, change_summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.agent_id,
    input.skill_id,
    input.source_skill_id ?? null,
    input.version,
    input.base_version ?? input.version,
    JSON.stringify(input.content ?? {}),
    input.status ?? 'active',
    input.sync_state ?? 'synced',
    input.change_summary ?? '',
    ts,
    ts,
  );
  return db
    .prepare(`SELECT * FROM sd_agent_skill_branch_versions WHERE id = ?`)
    .get(id) as AgentSkillBranchVersionRow;
}

export function syncAgentSkillBranchFromOverall(
  tenantId: string,
  agentId: string,
  skillId: string,
): AgentSkillBranchRow {
  const skill = getSkillBySkillId(tenantId, skillId);
  if (!skill) throw new Error('overall skill 不存在');
  const content = parseBranchContent(skill.content_json);
  const branch = upsertAgentSkillBranch({
    tenant_id: tenantId,
    agent_id: agentId,
    skill_id: skillId,
    source_skill_id: skillId,
    base_version: skill.version,
    head_version: skill.version,
    content,
    status: 'active',
    sync_state: 'synced',
  });
  upsertAgentSkillBranchVersion({
    tenant_id: tenantId,
    agent_id: agentId,
    skill_id: skillId,
    source_skill_id: skillId,
    version: skill.version,
    base_version: skill.version,
    content,
    status: 'active',
    sync_state: 'synced',
    change_summary: 'synced from overall',
  });
  return branch;
}

export function promoteAgentSkillBranchToOverall(
  tenantId: string,
  agentId: string,
  skillId: string,
): SkillRow | null {
  const branch = getAgentSkillBranch(tenantId, agentId, skillId);
  if (!branch) return null;
  const content = parseBranchContent(branch.content_json);
  const existing = getSkillBySkillId(tenantId, skillId);
  const nextVersion = existing ? incrementMinorVersion(existing.version) : '1.0.0';
  const updated = updateSkill(tenantId, skillId, {
    content,
    version: nextVersion,
    status: 'published',
  });
  if (updated) {
    upsertSkillVersion({
      tenant_id: tenantId,
      skill_id: skillId,
      version: nextVersion,
      name: updated.name,
      business_domain: updated.business_domain,
      description: updated.description,
      content,
      status: 'published',
    });
  }
  return updated;
}

/**
 * 跨 Agent 批量导入：将 source 的 SOP 分支/全局 SOP 复制到 targetAgentId。
 * source.agentId 为 'overall'（或空）时从全局 SOP 广场同步；否则从源 Agent 的分支复制。
 */
export function importSkillBranchesIntoAgent(
  tenantId: string,
  targetAgentId: string,
  source: { agentId?: string },
  skillIds?: string[],
): { imported: number } {
  let imported = 0;
  if (source.agentId && source.agentId !== 'overall') {
    let branches = listAgentSkillBranches(tenantId, source.agentId);
    if (skillIds && skillIds.length) branches = branches.filter((b) => skillIds.includes(b.skill_id));
    for (const b of branches) {
      const content = parseBranchContent(b.content_json);
      upsertAgentSkillBranch({
        tenant_id: tenantId,
        agent_id: targetAgentId,
        skill_id: b.skill_id,
        source_skill_id: b.skill_id,
        base_version: b.head_version,
        head_version: b.head_version,
        content,
        status: 'active',
        sync_state: 'synced',
      });
      imported += 1;
    }
  } else {
    let skills = listSkills({ tenantId });
    if (skillIds && skillIds.length) skills = skills.filter((s) => skillIds.includes(s.skill_id));
    for (const s of skills) {
      syncAgentSkillBranchFromOverall(tenantId, targetAgentId, s.skill_id);
      imported += 1;
    }
  }
  return { imported };
}
