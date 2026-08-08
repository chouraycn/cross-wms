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
  SkillStatsEntry,
  RecentSkillStatsEntry,
  SkillBranchMeta,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

// ===================== 技能统计聚合 =====================
// 对齐 StaffDeck 原版 backend/app/api/skills.py::_skill_stats / _recent_skill_stats。
// 统计口径：
//   · call_count      ← sd_agent_events 中 skill_started / skill_resumed 事件的 payload.to_skill_id
//   · positive/negative ← sd_skill_feedback，按 (skill_id, version, session, user) 去重成一次"流"，
//                         同一流内出现 down 记负，否则出现 up 记正（原版 down 优先）
//   · rate            ← feedback / call_count，保留 4 位小数；call_count 为 0 时记 0

const STATS_CALL_EVENT_TYPES = ['skill_started', 'skill_resumed'] as const;

function emptyStats(): SkillStatsEntry {
  return {
    call_count: 0,
    positive_feedback_count: 0,
    negative_feedback_count: 0,
    positive_rate: 0,
    negative_rate: 0,
  };
}

function statsKey(skillId: string, version: string): string {
  return `${skillId}@${version}`;
}

/** 技能统计表：key 为 skill_id（全量维度）或 `skill_id@version`（版本维度）。 */
export type SkillStatsMap = Map<string, SkillStatsEntry>;

function ensureEntry(stats: SkillStatsMap, key: string): SkillStatsEntry {
  let entry = stats.get(key);
  if (!entry) {
    entry = emptyStats();
    stats.set(key, entry);
  }
  return entry;
}

/**
 * 聚合租户下所有技能的调用与反馈统计（一次性两表扫描，避免 N+1）。
 * 对齐原版 _skill_stats。
 */
export function getSkillStats(tenantId: string = DEFAULT_TENANT_ID): SkillStatsMap {
  const db = initDb();
  const stats: SkillStatsMap = new Map();

  // —— 1. 调用次数 ——
  const placeholders = STATS_CALL_EVENT_TYPES.map(() => '?').join(',');
  const eventRows = db
    .prepare(
      `SELECT payload_json FROM sd_agent_events
       WHERE tenant_id = ? AND event_type IN (${placeholders})`,
    )
    .all(tenantId, ...STATS_CALL_EVENT_TYPES) as Array<{ payload_json: string | null }>;

  for (const row of eventRows) {
    let payload: Record<string, any> = {};
    try {
      payload = row.payload_json ? (JSON.parse(row.payload_json) as Record<string, any>) : {};
    } catch {
      continue;
    }
    const skillId = String(payload.to_skill_id ?? '');
    if (!skillId) continue;
    const version = String(payload.to_skill_version ?? payload.skill_version ?? '') || null;

    ensureEntry(stats, skillId).call_count += 1;
    if (version) ensureEntry(stats, statsKey(skillId, version)).call_count += 1;
  }

  // —— 2. 反馈：先按 (skill_id, version, session, user) 归并成"流" ——
  const feedbackRows = db
    .prepare(
      `SELECT skill_id, skill_version, session_id, user_id, rating
       FROM sd_skill_feedback WHERE tenant_id = ?`,
    )
    .all(tenantId) as Array<{
    skill_id: string;
    skill_version: string | null;
    session_id: string;
    user_id: string;
    rating: string;
  }>;

  const flows = new Map<string, { skillId: string; version: string | null; ratings: Set<string> }>();
  for (const fb of feedbackRows) {
    const key = `${fb.skill_id}\u0000${fb.skill_version ?? ''}\u0000${fb.session_id}\u0000${fb.user_id}`;
    let flow = flows.get(key);
    if (!flow) {
      flow = { skillId: fb.skill_id, version: fb.skill_version || null, ratings: new Set() };
      flows.set(key, flow);
    }
    flow.ratings.add(fb.rating);
  }

  for (const flow of flows.values()) {
    const targets: SkillStatsEntry[] = [ensureEntry(stats, flow.skillId)];
    if (flow.version) targets.push(ensureEntry(stats, statsKey(flow.skillId, flow.version)));
    // 原版语义：同一流内只要出现过 down 就整体记负，否则出现 up 记正
    const isNegative = flow.ratings.has('down');
    const isPositive = !isNegative && flow.ratings.has('up');
    for (const entry of targets) {
      if (isNegative) entry.negative_feedback_count += 1;
      else if (isPositive) entry.positive_feedback_count += 1;
    }
  }

  // —— 3. 比率 ——
  for (const entry of stats.values()) {
    entry.positive_rate = entry.call_count
      ? Math.round((entry.positive_feedback_count / entry.call_count) * 10000) / 10000
      : 0;
    entry.negative_rate = entry.call_count
      ? Math.round((entry.negative_feedback_count / entry.call_count) * 10000) / 10000
      : 0;
  }

  return stats;
}

/**
 * 按技能聚合"最近 3 个版本"的统计。对齐原版 _recent_skill_stats。
 */
export function getRecentSkillStats(
  tenantId: string = DEFAULT_TENANT_ID,
  stats?: SkillStatsMap,
): Map<string, RecentSkillStatsEntry> {
  const db = initDb();
  const base = stats ?? getSkillStats(tenantId);

  const recentVersions = new Map<string, string[]>();
  const versionRows = db
    .prepare(
      `SELECT skill_id, version FROM sd_skill_versions
       WHERE tenant_id = ?
       ORDER BY skill_id ASC, created_at DESC, version DESC`,
    )
    .all(tenantId) as Array<{ skill_id: string; version: string }>;
  for (const row of versionRows) {
    const list = recentVersions.get(row.skill_id) ?? [];
    if (list.length < 3) list.push(row.version);
    recentVersions.set(row.skill_id, list);
  }

  // 没有版本记录的技能，退化为自身当前版本
  const skillRows = db
    .prepare(`SELECT skill_id, version FROM sd_skills WHERE tenant_id = ?`)
    .all(tenantId) as Array<{ skill_id: string; version: string }>;
  for (const row of skillRows) {
    if (!recentVersions.has(row.skill_id)) recentVersions.set(row.skill_id, [row.version]);
  }

  const result = new Map<string, RecentSkillStatsEntry>();
  for (const [skillId, versions] of recentVersions) {
    const entry: RecentSkillStatsEntry = { ...emptyStats(), recent_versions: versions };
    for (const version of versions) {
      const vs = base.get(statsKey(skillId, version));
      if (!vs) continue;
      entry.call_count += vs.call_count;
      entry.positive_feedback_count += vs.positive_feedback_count;
      entry.negative_feedback_count += vs.negative_feedback_count;
    }
    entry.positive_rate = entry.call_count
      ? Math.round((entry.positive_feedback_count / entry.call_count) * 10000) / 10000
      : 0;
    entry.negative_rate = entry.call_count
      ? Math.round((entry.negative_feedback_count / entry.call_count) * 10000) / 10000
      : 0;
    result.set(skillId, entry);
  }
  return result;
}

/** 序列化上下文——不传时统计字段全部回落为 0，保证旧调用点行为不变。 */
export interface SkillReadContext {
  stats?: SkillStatsMap;
  recentStats?: Map<string, RecentSkillStatsEntry>;
  /** 员工分支元信息，key 为 skill_id。 */
  branchMeta?: Map<string, SkillBranchMeta>;
}

// ===================== Skills =====================

export function toSkillRead(row: SkillRow, ctx: SkillReadContext = {}): SkillRead {
  let content: Record<string, any> = {};
  try {
    content = row.content_json ? JSON.parse(row.content_json) : {};
  } catch {
    content = {};
  }

  const versionStats = ctx.stats?.get(statsKey(row.skill_id, row.version)) ?? emptyStats();
  const totalStats = ctx.stats?.get(row.skill_id) ?? emptyStats();
  const recent = ctx.recentStats?.get(row.skill_id);
  const branch = ctx.branchMeta?.get(row.skill_id);

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
    call_count: versionStats.call_count,
    positive_feedback_count: versionStats.positive_feedback_count,
    negative_feedback_count: versionStats.negative_feedback_count,
    positive_rate: versionStats.positive_rate,
    negative_rate: versionStats.negative_rate,
    total_call_count: totalStats.call_count,
    total_positive_feedback_count: totalStats.positive_feedback_count,
    total_negative_feedback_count: totalStats.negative_feedback_count,
    total_positive_rate: totalStats.positive_rate,
    total_negative_rate: totalStats.negative_rate,
    recent_versions: recent?.recent_versions ?? [row.version],
    recent_call_count: recent?.call_count ?? 0,
    recent_positive_feedback_count: recent?.positive_feedback_count ?? 0,
    recent_negative_feedback_count: recent?.negative_feedback_count ?? 0,
    recent_positive_rate: recent?.positive_rate ?? 0,
    recent_negative_rate: recent?.negative_rate ?? 0,
    agent_id: branch?.agent_id,
    branch_status: branch?.status,
    branch_sync_state: branch?.sync_state,
    branch_base_version: branch?.base_version,
    branch_head_version: branch?.head_version,
    metadata: branch?.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * 构造一个带完整统计上下文的序列化器（一次聚合、多行复用）。
 * 路由层用法：`const read = buildSkillReader(tenantId, agentId); rows.map(read)`
 */
export function buildSkillReader(
  tenantId: string = DEFAULT_TENANT_ID,
  agentId?: string,
): (row: SkillRow) => SkillRead {
  const stats = getSkillStats(tenantId);
  const recentStats = getRecentSkillStats(tenantId, stats);
  const branchMeta = agentId ? getAgentSkillBranchMeta(tenantId, agentId) : undefined;
  return (row: SkillRow) => toSkillRead(row, { stats, recentStats, branchMeta });
}

/** 读取某员工全部技能分支的元信息，key 为 skill_id。 */
export function getAgentSkillBranchMeta(
  tenantId: string,
  agentId: string,
): Map<string, SkillBranchMeta> {
  const db = initDb();
  const rows = db
    .prepare(
      `SELECT skill_id, source_skill_id, status, sync_state, base_version, head_version, metadata_json
       FROM sd_agent_skill_branches WHERE tenant_id = ? AND agent_id = ?`,
    )
    .all(tenantId, agentId) as Array<{
    skill_id: string;
    source_skill_id: string;
    status: string;
    sync_state: string;
    base_version: string;
    head_version: string;
    metadata_json: string | null;
  }>;

  const result = new Map<string, SkillBranchMeta>();
  for (const row of rows) {
    let metadata: Record<string, any> = {};
    try {
      metadata = row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, any>) : {};
    } catch {
      metadata = {};
    }
    const meta: SkillBranchMeta = {
      agent_id: agentId,
      status: row.status,
      sync_state: row.sync_state,
      base_version: row.base_version,
      head_version: row.head_version,
      metadata,
    };
    // 分支自身 skill_id 与来源 skill_id 都建索引，便于两种视角命中
    result.set(row.skill_id, meta);
    if (row.source_skill_id) result.set(row.source_skill_id, meta);
  }
  return result;
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
  const params: any[] = [tenantId];
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
  content?: Record<string, any>;
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
  content?: Record<string, any>;
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
  content?: Record<string, any>;
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
  content?: Record<string, any>;
  status?: string;
  sync_state?: string;
  metadata?: Record<string, any>;
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
function parseBranchContent(json?: string | null): Record<string, any> {
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
  content?: Record<string, any>;
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
