/**
 * StaffKnowledgeBaseDao — KnowledgeBase + Version + AgentKnowledgeBranch CRUD
 *
 * 涉及表：sd_knowledge_bases, sd_knowledge_base_versions, sd_agent_knowledge_branches
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID, newStaffId, StaffIdPrefix } from '../../db-staff.js';
import type {
  KnowledgeBaseRow,
  KnowledgeBaseRead,
  KnowledgeBaseVersionRow,
  AgentKnowledgeBranchRow,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

function safeJsonObj(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toKnowledgeBaseRead(row: KnowledgeBaseRow): KnowledgeBaseRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description,
    status: row.status,
    metadata: safeJsonObj(row.metadata_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===================== Knowledge Bases =====================

export interface KnowledgeBaseListFilter {
  tenantId?: string;
  status?: string;
  search?: string;
}

export function listKnowledgeBases(filter: KnowledgeBaseListFilter = {}): KnowledgeBaseRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.search && filter.search.trim() !== '') {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  const sql = `SELECT * FROM sd_knowledge_bases WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`;
  return db.prepare(sql).all(...params) as KnowledgeBaseRow[];
}

export function getKnowledgeBaseById(
  tenantId: string,
  knowledgeBaseId: string,
): KnowledgeBaseRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_knowledge_bases WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, knowledgeBaseId) as KnowledgeBaseRow | undefined;
}

export interface KnowledgeBaseInput {
  tenant_id?: string;
  name: string;
  description?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export function createKnowledgeBase(input: KnowledgeBaseInput): KnowledgeBaseRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.knowledgeBase);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_knowledge_bases
       (id, tenant_id, name, description, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.name,
    input.description ?? null,
    input.status ?? 'active',
    JSON.stringify(input.metadata ?? {}),
    ts,
    ts,
  );
  // 同步创建首个版本
  upsertKnowledgeBaseVersion({
    tenant_id: tenantId,
    knowledge_base_id: id,
    version: '1.0.0',
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? 'active',
    metadata: input.metadata ?? {},
  });
  return db.prepare(`SELECT * FROM sd_knowledge_bases WHERE id = ?`).get(id) as KnowledgeBaseRow;
}

export interface KnowledgeBaseUpdateInput {
  name?: string;
  description?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export function updateKnowledgeBase(
  tenantId: string,
  knowledgeBaseId: string,
  patch: KnowledgeBaseUpdateInput,
): KnowledgeBaseRow | null {
  const db = initDb();
  const existing = getKnowledgeBaseById(tenantId, knowledgeBaseId);
  if (!existing) return null;
  const ts = now();
  const next: KnowledgeBaseRow = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    status: patch.status ?? existing.status,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_knowledge_bases
     SET name = ?, description = ?, status = ?, metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.name,
    next.description,
    next.status,
    next.metadata_json,
    next.updated_at,
    existing.id,
  );
  return next;
}

export function deleteKnowledgeBase(tenantId: string, knowledgeBaseId: string): boolean {
  const db = initDb();
  const existing = getKnowledgeBaseById(tenantId, knowledgeBaseId);
  if (!existing) return false;
  // 级联清理
  db.prepare(`DELETE FROM sd_knowledge_base_versions WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_agent_knowledge_branches WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_buckets WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_concepts WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_discovery_suggestions WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_ingest_jobs WHERE tenant_id = ? AND knowledge_base_id = ?`)
    .run(tenantId, knowledgeBaseId);
  db.prepare(`DELETE FROM sd_knowledge_bases WHERE id = ?`).run(existing.id);
  return true;
}

// ===================== Knowledge Base Versions =====================

export interface KnowledgeBaseVersionInput {
  tenant_id?: string;
  knowledge_base_id: string;
  version?: string;
  name: string;
  description?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export function listKnowledgeBaseVersions(
  tenantId: string,
  knowledgeBaseId: string,
): KnowledgeBaseVersionRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_knowledge_base_versions
       WHERE tenant_id = ? AND knowledge_base_id = ?
       ORDER BY created_at DESC`,
    )
    .all(tenantId, knowledgeBaseId) as KnowledgeBaseVersionRow[];
}

export function getKnowledgeBaseVersion(
  tenantId: string,
  knowledgeBaseId: string,
  version: string,
): KnowledgeBaseVersionRow | undefined {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_knowledge_base_versions
       WHERE tenant_id = ? AND knowledge_base_id = ? AND version = ?`,
    )
    .get(tenantId, knowledgeBaseId, version) as KnowledgeBaseVersionRow | undefined;
}

export function upsertKnowledgeBaseVersion(input: KnowledgeBaseVersionInput): KnowledgeBaseVersionRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const version = input.version ?? '1.0.0';
  const existing = getKnowledgeBaseVersion(tenantId, input.knowledge_base_id, version);
  const ts = now();
  const metadataJson = JSON.stringify(input.metadata ?? {});
  if (existing) {
    db.prepare(
      `UPDATE sd_knowledge_base_versions
       SET name = ?, description = ?, status = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.name, input.description ?? null, input.status ?? 'active', metadataJson, ts, existing.id);
    return { ...existing, name: input.name, metadata_json: metadataJson, updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.knowledgeBaseVersion);
  db.prepare(
    `INSERT INTO sd_knowledge_base_versions
       (id, tenant_id, knowledge_base_id, version, name, description, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.knowledge_base_id,
    version,
    input.name,
    input.description ?? null,
    input.status ?? 'active',
    metadataJson,
    ts,
    ts,
  );
  return db
    .prepare(`SELECT * FROM sd_knowledge_base_versions WHERE id = ?`)
    .get(id) as KnowledgeBaseVersionRow;
}

export function deleteKnowledgeBaseVersion(
  tenantId: string,
  knowledgeBaseId: string,
  version: string,
): boolean {
  const db = initDb();
  const r = db
    .prepare(
      `DELETE FROM sd_knowledge_base_versions
       WHERE tenant_id = ? AND knowledge_base_id = ? AND version = ?`,
    )
    .run(tenantId, knowledgeBaseId, version);
  return r.changes > 0;
}

export function rollbackKnowledgeBase(
  tenantId: string,
  knowledgeBaseId: string,
  version: string,
): KnowledgeBaseRow | null {
  const db = initDb();
  const target = getKnowledgeBaseVersion(tenantId, knowledgeBaseId, version);
  if (!target) return null;
  const ts = now();
  db.prepare(
    `UPDATE sd_knowledge_bases
     SET name = ?, description = ?, status = ?, metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    target.name,
    target.description,
    target.status,
    target.metadata_json,
    ts,
    knowledgeBaseId,
  );
  return getKnowledgeBaseById(tenantId, knowledgeBaseId) ?? null;
}

// ===================== 分支版本化：sync / promote =====================
function parseKbBranchContent(json?: string | null): Record<string, unknown> {
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
/** KB 行的当前版本取自 sd_knowledge_base_versions 表（主表无 version 列） */
function latestKbVersion(tenantId: string, kbId: string): string {
  const versions = listKnowledgeBaseVersions(tenantId, kbId);
  return versions.length ? versions[0].version : '1.0.0';
}

export function syncAgentKnowledgeBranchFromOverall(
  tenantId: string,
  agentId: string,
  kbId: string,
): AgentKnowledgeBranchRow {
  const kb = getKnowledgeBaseById(tenantId, kbId);
  if (!kb) throw new Error('overall knowledge base 不存在');
  const content = parseKbBranchContent(kb.metadata_json);
  const baseVersion = latestKbVersion(tenantId, kbId);
  return upsertAgentKnowledgeBranch({
    tenant_id: tenantId,
    agent_id: agentId,
    knowledge_base_id: kbId,
    base_version: baseVersion,
    head_version: baseVersion,
    status: 'active',
    sync_state: 'synced',
    metadata: content,
  });
}
export function promoteAgentKnowledgeBranchToOverall(
  tenantId: string,
  agentId: string,
  kbId: string,
): KnowledgeBaseRow | null {
  const branch = getAgentKnowledgeBranch(tenantId, agentId, kbId);
  if (!branch) return null;
  const content = parseKbBranchContent(branch.metadata_json);
  const existing = getKnowledgeBaseById(tenantId, kbId);
  if (!existing) return null;
  const nextVersion = incrementMinorVersion(latestKbVersion(tenantId, kbId));
  const updated = updateKnowledgeBase(tenantId, kbId, {
    metadata: content,
    status: 'published',
  });
  if (updated) {
    upsertKnowledgeBaseVersion({
      tenant_id: tenantId,
      knowledge_base_id: kbId,
      version: nextVersion,
      name: updated.name,
      description: updated.description ?? null,
      status: 'published',
      metadata: content,
    });
  }
  return updated;
}

/**
 * 跨 Agent 批量导入：将 source 的知识库分支/全局知识库复制到 targetAgentId。
 * source.agentId 为 'overall'（或空）时从全局知识库同步；否则从源 Agent 的分支复制。
 */
export function importKnowledgeBranchesIntoAgent(
  tenantId: string,
  targetAgentId: string,
  source: { agentId?: string },
  kbIds?: string[],
): { imported: number } {
  let imported = 0;
  if (source.agentId && source.agentId !== 'overall') {
    let branches = listAgentKnowledgeBranches(tenantId, source.agentId);
    if (kbIds && kbIds.length) branches = branches.filter((b) => kbIds.includes(b.knowledge_base_id));
    for (const b of branches) {
      const content = parseKbBranchContent(b.metadata_json);
      upsertAgentKnowledgeBranch({
        tenant_id: tenantId,
        agent_id: targetAgentId,
        knowledge_base_id: b.knowledge_base_id,
        base_version: b.head_version,
        head_version: b.head_version,
        status: 'active',
        sync_state: 'synced',
        metadata: content,
      });
      imported += 1;
    }
  } else {
    let kbs = listKnowledgeBases({ tenantId });
    if (kbIds && kbIds.length) kbs = kbs.filter((k) => kbIds.includes(k.id));
    for (const k of kbs) {
      syncAgentKnowledgeBranchFromOverall(tenantId, targetAgentId, k.id);
      imported += 1;
    }
  }
  return { imported };
}

// ===================== Agent Knowledge Branches =====================

export function listAgentKnowledgeBranches(
  tenantId: string,
  agentId: string,
): AgentKnowledgeBranchRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_agent_knowledge_branches
       WHERE tenant_id = ? AND agent_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(tenantId, agentId) as AgentKnowledgeBranchRow[];
}

export function getAgentKnowledgeBranch(
  tenantId: string,
  agentId: string,
  knowledgeBaseId: string,
): AgentKnowledgeBranchRow | undefined {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_agent_knowledge_branches
       WHERE tenant_id = ? AND agent_id = ? AND knowledge_base_id = ?`,
    )
    .get(tenantId, agentId, knowledgeBaseId) as AgentKnowledgeBranchRow | undefined;
}

export interface AgentKnowledgeBranchInput {
  tenant_id?: string;
  agent_id: string;
  knowledge_base_id: string;
  base_version?: string;
  head_version?: string;
  status?: string;
  sync_state?: string;
  metadata?: Record<string, unknown>;
}

export function upsertAgentKnowledgeBranch(input: AgentKnowledgeBranchInput): AgentKnowledgeBranchRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const existing = getAgentKnowledgeBranch(tenantId, input.agent_id, input.knowledge_base_id);
  const ts = now();
  const metadataJson = JSON.stringify(input.metadata ?? {});
  if (existing) {
    db.prepare(
      `UPDATE sd_agent_knowledge_branches
       SET base_version = ?, head_version = ?, status = ?, sync_state = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.base_version ?? '1.0.0',
      input.head_version ?? '1.0.0',
      input.status ?? 'active',
      input.sync_state ?? 'synced',
      metadataJson,
      ts,
      existing.id,
    );
    return { ...existing, metadata_json: metadataJson, updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.agentKnowledgeBranch);
  db.prepare(
    `INSERT INTO sd_agent_knowledge_branches
       (id, tenant_id, agent_id, knowledge_base_id, base_version, head_version,
        status, sync_state, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.agent_id,
    input.knowledge_base_id,
    input.base_version ?? '1.0.0',
    input.head_version ?? '1.0.0',
    input.status ?? 'active',
    input.sync_state ?? 'synced',
    metadataJson,
    ts,
    ts,
  );
  return db
    .prepare(`SELECT * FROM sd_agent_knowledge_branches WHERE id = ?`)
    .get(id) as AgentKnowledgeBranchRow;
}

export function deleteAgentKnowledgeBranch(
  tenantId: string,
  agentId: string,
  knowledgeBaseId: string,
): boolean {
  const db = initDb();
  const r = db
    .prepare(
      `DELETE FROM sd_agent_knowledge_branches
       WHERE tenant_id = ? AND agent_id = ? AND knowledge_base_id = ?`,
    )
    .run(tenantId, agentId, knowledgeBaseId);
  return r.changes > 0;
}
