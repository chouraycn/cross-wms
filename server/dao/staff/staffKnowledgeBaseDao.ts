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

/** 单个知识库的资产统计 */
export interface KnowledgeBaseStats {
  document_count: number;
  bucket_count: number;
  chunk_count: number;
}

const EMPTY_STATS: KnowledgeBaseStats = { document_count: 0, bucket_count: 0, chunk_count: 0 };

/**
 * 批量聚合租户下各知识库的文档/目录/引用数量。
 *
 * 搬移自 StaffDeck 原版 `_knowledge_base_stats`（backend/app/api/knowledge_bases.py）。
 * 一次性 GROUP BY 聚合三张表，避免 N+1 查询。
 *
 * @param tenantId 租户 ID
 * @param versionIds 可选，限定只统计这些知识库版本下的资产（用于员工分支视图）
 */
export function getKnowledgeBaseStats(
  tenantId: string,
  versionIds?: string[],
): Map<string, KnowledgeBaseStats> {
  const db = initDb();
  const stats = new Map<string, KnowledgeBaseStats>();

  // versionIds 为空数组表示"无可见版本" → 全部统计为 0
  if (versionIds && versionIds.length === 0) return stats;

  const versionFilter = versionIds
    ? ` AND knowledge_base_version_id IN (${versionIds.map(() => '?').join(',')})`
    : '';
  const params: any[] = versionIds ? [tenantId, ...versionIds] : [tenantId];

  const ensure = (kbId: string): KnowledgeBaseStats => {
    let entry = stats.get(kbId);
    if (!entry) {
      entry = { ...EMPTY_STATS };
      stats.set(kbId, entry);
    }
    return entry;
  };

  const sources: Array<{ table: string; field: keyof KnowledgeBaseStats }> = [
    { table: 'sd_knowledge_documents', field: 'document_count' },
    { table: 'sd_knowledge_buckets', field: 'bucket_count' },
    { table: 'sd_knowledge_chunks', field: 'chunk_count' },
  ];

  for (const { table, field } of sources) {
    const rows = db
      .prepare(
        `SELECT knowledge_base_id AS kbId, COUNT(id) AS cnt FROM ${table}
         WHERE tenant_id = ?${versionFilter} GROUP BY knowledge_base_id`,
      )
      .all(...params) as Array<{ kbId: string; cnt: number }>;
    for (const row of rows) {
      if (!row.kbId) continue;
      ensure(row.kbId)[field] = Number(row.cnt) || 0;
    }
  }

  return stats;
}

/**
 * 知识库序列化上下文。对齐原版 `knowledge_base_read(row, stats, version_row, branch_meta)`。
 * 两者缺省时行为与旧版一致（version 为 null、status 取 row.status）。
 */
export interface KnowledgeBaseReadContext {
  /** 生效的版本行；存在时 name/description/metadata 以版本为准 */
  versionRow?: KnowledgeBaseVersionRow;
  /** 员工分支元信息；存在时覆盖 status 并填充 branch_* 字段 */
  branchMeta?: AgentKnowledgeBranchRow;
}

export function toKnowledgeBaseRead(
  row: KnowledgeBaseRow,
  stats?: KnowledgeBaseStats,
  ctx: KnowledgeBaseReadContext = {},
): KnowledgeBaseRead {
  const { versionRow, branchMeta } = ctx;

  // 原版语义：分支状态覆盖知识库状态（inactive → archived）
  let effectiveStatus = row.status;
  if (branchMeta?.status === 'inactive') effectiveStatus = 'archived';
  else if (branchMeta?.status) effectiveStatus = branchMeta.status;

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: versionRow?.name ?? row.name,
    description: versionRow ? versionRow.description : row.description,
    status: effectiveStatus,
    version: versionRow?.version,
    branch_sync_state: branchMeta?.sync_state,
    branch_base_version: branchMeta?.base_version,
    branch_head_version: branchMeta?.head_version,
    metadata: safeJsonObj(versionRow ? versionRow.metadata_json : row.metadata_json),
    document_count: stats?.document_count ?? 0,
    bucket_count: stats?.bucket_count ?? 0,
    chunk_count: stats?.chunk_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 读取某员工全部知识库分支元信息，key 为 knowledge_base_id。 */
export function getAgentKnowledgeBranchMeta(
  tenantId: string,
  agentId: string,
): Map<string, AgentKnowledgeBranchRow> {
  const map = new Map<string, AgentKnowledgeBranchRow>();
  for (const branch of listAgentKnowledgeBranches(tenantId, agentId)) {
    if (!map.has(branch.knowledge_base_id)) map.set(branch.knowledge_base_id, branch);
  }
  return map;
}

/**
 * 解析各知识库"当前生效版本"，key 为 knowledge_base_id。
 *
 * - 传 agentId：按该员工分支的 head_version 取版本（员工看到的是自己的分支视图）
 * - 不传：取基线版本（排除 `-branch.` 后缀的分支版本），对齐原版
 *   `_management_knowledge_base_versions`
 */
export function getEffectiveKnowledgeBaseVersions(
  tenantId: string = DEFAULT_TENANT_ID,
  agentId?: string,
): Map<string, KnowledgeBaseVersionRow> {
  const db = initDb();
  const rows = db
    .prepare(
      `SELECT * FROM sd_knowledge_base_versions WHERE tenant_id = ? ORDER BY created_at DESC`,
    )
    .all(tenantId) as KnowledgeBaseVersionRow[];

  const result = new Map<string, KnowledgeBaseVersionRow>();
  if (agentId) {
    const branches = getAgentKnowledgeBranchMeta(tenantId, agentId);
    for (const row of rows) {
      const branch = branches.get(row.knowledge_base_id);
      if (branch && row.version === branch.head_version) result.set(row.knowledge_base_id, row);
    }
    // 分支 head 未落库时退化到基线版本，避免 version 为空
    for (const [kbId, branch] of branches) {
      if (result.has(kbId)) continue;
      const fallback = rows.find(
        (r) => r.knowledge_base_id === kbId && !r.version.includes('-branch.'),
      );
      if (fallback) result.set(kbId, fallback);
      else void branch;
    }
    return result;
  }

  for (const row of rows) {
    if (row.version.includes('-branch.')) continue;
    if (!result.has(row.knowledge_base_id)) result.set(row.knowledge_base_id, row);
  }
  return result;
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
  const params: any[] = [tenantId];
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
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
function parseKbBranchContent(json?: string | null): Record<string, any> {
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

/**
 * 解析某个员工可见的知识库 ID 集合。
 *
 * 对齐 StaffDeck 原版 `visible_knowledge_base_versions`：员工通过
 * sd_agent_knowledge_branches 挂载知识库分支，只有 active 分支对该员工可见。
 * 未挂载任何分支时返回空数组（调用方据此返回空列表，而非退化为"全部可见"）。
 */
export function getAgentVisibleKnowledgeBaseIds(tenantId: string, agentId: string): string[] {
  return listAgentKnowledgeBranches(tenantId, agentId)
    .filter((branch) => branch.status !== 'inactive')
    .map((branch) => branch.knowledge_base_id);
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
  metadata?: Record<string, any>;
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
