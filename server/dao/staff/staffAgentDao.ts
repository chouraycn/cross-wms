/**
 * StaffAgentDao — AgentProfile / AgentUsage / AgentModelBinding / AgentResourceBinding CRUD
 *
 * 所有函数返回纯数据 row 对象，路由层负责响应包装。
 * 表名均带 sd_ 前缀，与 cross-wms 既有表完全隔离。
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID, newStaffId, StaffIdPrefix } from '../../db-staff.js';
import type {
  AgentProfileRow,
  AgentProfileInput,
  AgentProfileRead,
  AgentUsageRow,
  AgentModelBindingRow,
  AgentResourceBindingRow,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

/** row -> read（含 JSON 反序列化与 boolean 转换） */
export function toAgentRead(row: AgentProfileRow): AgentProfileRead {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description,
    persona_prompt: row.persona_prompt,
    is_overall: row.is_overall === 1,
    status: row.status,
    metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 列出指定租户下的全部 Agent（按 is_overall desc, updated_at desc） */
export function listAgents(tenantId: string = DEFAULT_TENANT_ID): AgentProfileRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_agent_profiles WHERE tenant_id = ? ORDER BY is_overall DESC, updated_at DESC`,
    )
    .all(tenantId) as AgentProfileRow[];
}

/** 根据 id 获取单个 Agent */
export function getAgentById(
  tenantId: string,
  agentId: string,
): AgentProfileRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_agent_profiles WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, agentId) as AgentProfileRow | undefined;
}

/** 获取 overall agent（is_overall=1） */
export function getOverallAgent(tenantId: string = DEFAULT_TENANT_ID): AgentProfileRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_agent_profiles WHERE tenant_id = ? AND is_overall = 1 LIMIT 1`)
    .get(tenantId) as AgentProfileRow | undefined;
}

/** 创建 Agent */
export function createAgent(input: AgentProfileInput): AgentProfileRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.agent);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_agent_profiles
       (id, tenant_id, name, description, persona_prompt, is_overall, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.name,
    input.description ?? null,
    input.persona_prompt ?? null,
    input.is_overall ? 1 : 0,
    input.status ?? 'active',
    JSON.stringify(input.metadata ?? {}),
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_agent_profiles WHERE id = ?`).get(id) as AgentProfileRow;
}

/** 更新 Agent（部分字段） */
export function updateAgent(
  tenantId: string,
  agentId: string,
  patch: Partial<AgentProfileInput>,
): AgentProfileRow | null {
  const db = initDb();
  const existing = getAgentById(tenantId, agentId);
  if (!existing) return null;

  const next: AgentProfileRow = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    persona_prompt:
      patch.persona_prompt !== undefined ? patch.persona_prompt : existing.persona_prompt,
    is_overall: patch.is_overall !== undefined ? (patch.is_overall ? 1 : 0) : existing.is_overall,
    status: patch.status ?? existing.status,
    metadata_json:
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata_json,
    updated_at: now(),
  };

  db.prepare(
    `UPDATE sd_agent_profiles
     SET name = ?, description = ?, persona_prompt = ?, is_overall = ?, status = ?, metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.name,
    next.description,
    next.persona_prompt,
    next.is_overall,
    next.status,
    next.metadata_json,
    next.updated_at,
    agentId,
  );

  return next;
}

/** 删除 Agent */
export function deleteAgent(tenantId: string, agentId: string): boolean {
  const db = initDb();
  const existing = getAgentById(tenantId, agentId);
  if (!existing) return false;
  db.prepare(`DELETE FROM sd_agent_profiles WHERE id = ?`).run(agentId);
  return true;
}

// ===================== Agent Usage（user 使用过的 agent 列表） =====================

export function listAgentUsagesByUser(
  tenantId: string,
  userId: string,
): AgentUsageRow[] {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_agent_usages WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at DESC`)
    .all(tenantId, userId) as AgentUsageRow[];
}

export function upsertAgentUsage(tenantId: string, userId: string, agentId: string): AgentUsageRow {
  const db = initDb();
  const existing = db
    .prepare(`SELECT * FROM sd_agent_usages WHERE tenant_id = ? AND user_id = ? AND agent_id = ?`)
    .get(tenantId, userId, agentId) as AgentUsageRow | undefined;
  const ts = now();
  if (existing) {
    db.prepare(`UPDATE sd_agent_usages SET updated_at = ? WHERE id = ?`).run(ts, existing.id);
    return { ...existing, updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.agentUsage);
  db.prepare(
    `INSERT INTO sd_agent_usages (id, tenant_id, user_id, agent_id, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', ?, ?)`,
  ).run(id, tenantId, userId, agentId, ts, ts);
  return db.prepare(`SELECT * FROM sd_agent_usages WHERE id = ?`).get(id) as AgentUsageRow;
}

// ===================== Agent Model Bindings =====================

export function listAgentModelBindings(
  tenantId: string,
  agentId: string,
): AgentModelBindingRow[] {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_agent_model_bindings WHERE tenant_id = ? AND agent_id = ? ORDER BY role ASC`)
    .all(tenantId, agentId) as AgentModelBindingRow[];
}

export function upsertAgentModelBinding(
  tenantId: string,
  agentId: string,
  role: string,
  modelConfigId: string,
): AgentModelBindingRow {
  const db = initDb();
  const existing = db
    .prepare(`SELECT * FROM sd_agent_model_bindings WHERE tenant_id = ? AND agent_id = ? AND role = ?`)
    .get(tenantId, agentId, role) as AgentModelBindingRow | undefined;
  const ts = now();
  if (existing) {
    db.prepare(
      `UPDATE sd_agent_model_bindings SET model_config_id = ?, updated_at = ? WHERE id = ?`,
    ).run(modelConfigId, ts, existing.id);
    return { ...existing, model_config_id: modelConfigId, updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.agentModelBinding);
  db.prepare(
    `INSERT INTO sd_agent_model_bindings (id, tenant_id, agent_id, role, model_config_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tenantId, agentId, role, modelConfigId, ts, ts);
  return db.prepare(`SELECT * FROM sd_agent_model_bindings WHERE id = ?`).get(id) as AgentModelBindingRow;
}

export function deleteAgentModelBinding(
  tenantId: string,
  agentId: string,
  role: string,
): boolean {
  const db = initDb();
  const r = db
    .prepare(`DELETE FROM sd_agent_model_bindings WHERE tenant_id = ? AND agent_id = ? AND role = ?`)
    .run(tenantId, agentId, role);
  return r.changes > 0;
}

// ===================== Agent Resource Bindings =====================

export function listAgentResourceBindings(
  tenantId: string,
  agentId: string,
  resourceType?: string,
): AgentResourceBindingRow[] {
  const db = initDb();
  if (resourceType) {
    return db
      .prepare(
        `SELECT * FROM sd_agent_resource_bindings
         WHERE tenant_id = ? AND agent_id = ? AND resource_type = ?
         ORDER BY updated_at DESC`,
      )
      .all(tenantId, agentId, resourceType) as AgentResourceBindingRow[];
  }
  return db
    .prepare(
      `SELECT * FROM sd_agent_resource_bindings WHERE tenant_id = ? AND agent_id = ? ORDER BY updated_at DESC`,
    )
    .all(tenantId, agentId) as AgentResourceBindingRow[];
}

export function upsertAgentResourceBinding(
  tenantId: string,
  agentId: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
  status: string = 'active',
): AgentResourceBindingRow {
  const db = initDb();
  const existing = db
    .prepare(
      `SELECT * FROM sd_agent_resource_bindings
       WHERE tenant_id = ? AND agent_id = ? AND resource_type = ? AND resource_id = ?`,
    )
    .get(tenantId, agentId, resourceType, resourceId) as AgentResourceBindingRow | undefined;
  const ts = now();
  if (existing) {
    db.prepare(
      `UPDATE sd_agent_resource_bindings
       SET status = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(status, JSON.stringify(metadata), ts, existing.id);
    return { ...existing, status, metadata_json: JSON.stringify(metadata), updated_at: ts };
  }
  const id = newStaffId(StaffIdPrefix.agentResourceBinding);
  db.prepare(
    `INSERT INTO sd_agent_resource_bindings
       (id, tenant_id, agent_id, resource_type, resource_id, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tenantId, agentId, resourceType, resourceId, status, JSON.stringify(metadata), ts, ts);
  return db
    .prepare(`SELECT * FROM sd_agent_resource_bindings WHERE id = ?`)
    .get(id) as AgentResourceBindingRow;
}

export function deleteAgentResourceBinding(
  tenantId: string,
  agentId: string,
  resourceType: string,
  resourceId: string,
): boolean {
  const db = initDb();
  const r = db
    .prepare(
      `DELETE FROM sd_agent_resource_bindings
       WHERE tenant_id = ? AND agent_id = ? AND resource_type = ? AND resource_id = ?`,
    )
    .run(tenantId, agentId, resourceType, resourceId);
  return r.changes > 0;
}
