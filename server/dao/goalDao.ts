/**
 * goalDao — durable goal 投影表（StaffDeck 看板查询用）
 *
 * 数据源：goal/change 账本事件（事件溯源，见 goalService.ts）。
 * 本表只是投影缓存（每次变更 upsert），供"按租户/状态列出目标"类看板查询，
 * 不做事实源——一致性以 ledger 为准。
 */

import { initDb } from '../db.js';
import type { GoalPhase, GoalSnapshot } from '../engine/goalService.js';

export interface GoalRow {
  session_id: string;
  tenant_id: string | null;
  agent_id: string | null;
  objective: string;
  phase: GoalPhase;
  blocked_code: string | null;
  blocked_message: string | null;
  max_goal_rounds: number;
  rounds_started: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  initDb().exec(`
    CREATE TABLE IF NOT EXISTS goals (
      session_id       TEXT PRIMARY KEY,
      tenant_id        TEXT,
      agent_id         TEXT,
      objective        TEXT NOT NULL,
      phase            TEXT NOT NULL,
      blocked_code     TEXT,
      blocked_message  TEXT,
      max_goal_rounds  INTEGER NOT NULL DEFAULT 0,
      rounds_started   INTEGER NOT NULL DEFAULT 0,
      revision         INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_goals_tenant_phase ON goals(tenant_id, phase);
  `);
  schemaReady = true;
}

/** upsert 目标投影（每次 goal/change 提交后调用） */
export function upsertGoal(snapshot: GoalSnapshot): void {
  ensureSchema();
  initDb()
    .prepare(
      `INSERT OR REPLACE INTO goals
       (session_id, tenant_id, agent_id, objective, phase, blocked_code, blocked_message,
        max_goal_rounds, rounds_started, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      snapshot.sessionId,
      snapshot.tenantId ?? null,
      snapshot.agentId ?? null,
      snapshot.objective,
      snapshot.phase,
      snapshot.blockedReason?.code ?? null,
      snapshot.blockedReason?.message ?? null,
      snapshot.maxGoalRounds,
      snapshot.roundsStarted,
      snapshot.revision,
      snapshot.createdAt,
      snapshot.updatedAt,
    );
}

/** 清除投影（goal clear 后调用） */
export function deleteGoal(sessionId: string): void {
  ensureSchema();
  initDb().prepare('DELETE FROM goals WHERE session_id = ?').run(sessionId);
}

export function toGoalRow(row: Record<string, unknown>): GoalRow {
  return {
    session_id: String(row.session_id),
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
    agent_id: row.agent_id == null ? null : String(row.agent_id),
    objective: String(row.objective),
    phase: String(row.phase) as GoalPhase,
    blocked_code: row.blocked_code == null ? null : String(row.blocked_code),
    blocked_message: row.blocked_message == null ? null : String(row.blocked_message),
    max_goal_rounds: Number(row.max_goal_rounds),
    rounds_started: Number(row.rounds_started),
    revision: Number(row.revision),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

/** 按租户列出目标（可过滤 phase）—— StaffDeck 任务看板数据源 */
export function listGoalsByTenant(tenantId: string, phase?: GoalPhase): GoalRow[] {
  ensureSchema();
  const db = initDb();
  const rows = phase
    ? db.prepare('SELECT * FROM goals WHERE tenant_id = ? AND phase = ? ORDER BY updated_at DESC').all(tenantId, phase)
    : db.prepare('SELECT * FROM goals WHERE tenant_id = ? ORDER BY updated_at DESC').all(tenantId);
  return (rows as Record<string, unknown>[]).map(toGoalRow);
}

/** 读单个会话的目标投影 */
export function getGoalBySession(sessionId: string): GoalRow | null {
  ensureSchema();
  const row = initDb().prepare('SELECT * FROM goals WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined;
  return row ? toGoalRow(row) : null;
}
