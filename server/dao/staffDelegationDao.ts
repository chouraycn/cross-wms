/**
 * staffDelegationDao — 员工互相派活持久层（P2b）
 *
 * sd_delegations 表 = 派活的持久 descriptor：
 *   parent_agent_id（谁派的）+ child_agent_id（派给谁）+ parent_session_id（父授权锚点）
 *   + task_description + depth（委托深度，防递归失控）+ status 状态机。
 *
 * 状态机：pending → active → completed / failed（可 blocked 暂停）
 */

import { initDb } from '../db.js';

export type DelegationStatus = 'pending' | 'active' | 'blocked' | 'completed' | 'failed';

export interface DelegationRow {
  id: string;
  tenant_id: string;
  parent_agent_id: string;
  child_agent_id: string;
  parent_session_id: string;
  child_session_id: string | null;
  task_description: string;
  depth: number;
  status: DelegationStatus;
  error: string | null;
  created_at: number;
  updated_at: number;
}

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  initDb().exec(`
    CREATE TABLE IF NOT EXISTS sd_delegations (
      id                TEXT PRIMARY KEY,
      tenant_id         TEXT NOT NULL,
      parent_agent_id   TEXT NOT NULL,
      child_agent_id    TEXT NOT NULL,
      parent_session_id TEXT NOT NULL,
      child_session_id  TEXT,
      task_description  TEXT NOT NULL,
      depth             INTEGER NOT NULL DEFAULT 1,
      status            TEXT NOT NULL DEFAULT 'pending',
      error             TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_delegations_tenant_status ON sd_delegations(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_delegations_parent ON sd_delegations(tenant_id, parent_agent_id);
  `);
  schemaReady = true;
}

export interface CreateDelegationInput {
  id: string;
  tenantId: string;
  parentAgentId: string;
  childAgentId: string;
  parentSessionId: string;
  taskDescription: string;
  depth: number;
}

export function createDelegation(input: CreateDelegationInput): DelegationRow {
  ensureSchema();
  const now = Date.now();
  initDb()
    .prepare(
      `INSERT INTO sd_delegations
       (id, tenant_id, parent_agent_id, child_agent_id, parent_session_id, task_description, depth, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      input.id, input.tenantId, input.parentAgentId, input.childAgentId,
      input.parentSessionId, input.taskDescription, input.depth, now, now,
    );
  return getDelegationById(input.tenantId, input.id)!;
}

export function toDelegationRow(row: Record<string, unknown>): DelegationRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    parent_agent_id: String(row.parent_agent_id),
    child_agent_id: String(row.child_agent_id),
    parent_session_id: String(row.parent_session_id),
    child_session_id: row.child_session_id == null ? null : String(row.child_session_id),
    task_description: String(row.task_description),
    depth: Number(row.depth),
    status: String(row.status) as DelegationStatus,
    error: row.error == null ? null : String(row.error),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

export function getDelegationById(tenantId: string, id: string): DelegationRow | null {
  ensureSchema();
  const row = initDb().prepare('SELECT * FROM sd_delegations WHERE id = ? AND tenant_id = ?').get(id, tenantId) as
    | Record<string, unknown>
    | undefined;
  return row ? toDelegationRow(row) : null;
}

export function listDelegations(
  tenantId: string,
  filter: { status?: DelegationStatus; agentId?: string } = {},
): DelegationRow[] {
  ensureSchema();
  const clauses: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  if (filter.agentId) {
    clauses.push('(parent_agent_id = ? OR child_agent_id = ?)');
    params.push(filter.agentId, filter.agentId);
  }
  const rows = initDb()
    .prepare(`SELECT * FROM sd_delegations WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`)
    .all(...params) as Record<string, unknown>[];
  return rows.map(toDelegationRow);
}

/** 父员工当前最深的进行中派活深度（无则 0） */
export function maxActiveDepthOfParent(tenantId: string, parentAgentId: string): number {
  ensureSchema();
  const row = initDb()
    .prepare(
      `SELECT MAX(depth) AS m FROM sd_delegations
       WHERE tenant_id = ? AND parent_agent_id = ? AND status IN ('pending', 'active', 'blocked')`
    )
    .get(tenantId, parentAgentId) as { m: number | null };
  return row.m ?? 0;
}

export function updateDelegationStatus(
  tenantId: string,
  id: string,
  status: DelegationStatus,
  patch: { childSessionId?: string; error?: string } = {},
): DelegationRow | null {
  ensureSchema();
  const now = Date.now();
  const sets: string[] = ['status = ?', 'updated_at = ?'];
  const params: unknown[] = [status, now];
  if (patch.childSessionId !== undefined) {
    sets.push('child_session_id = ?');
    params.push(patch.childSessionId);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    params.push(patch.error);
  }
  params.push(id, tenantId);
  initDb()
    .prepare(`UPDATE sd_delegations SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`)
    .run(...params);
  return getDelegationById(tenantId, id);
}
