/**
 * StaffTraceDao — sd_agent_events 表 CRUD（Agent 事件流追踪）
 *
 * 设计：
 * - 按 session_id 查询事件流
 * - payload_json 以 TEXT 存储，DAO 负责序列化/反序列化
 * - 时间字段使用 INTEGER（Unix 秒）
 * - 用于 /api/staffdeck/traces 端点
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix } from '../../db-staff.js';
import type { AgentEventRow, AgentEventRead } from '../../types/staff.js';

/** row -> read（含 payload 反序列化） */
export function toAgentEventRead(row: AgentEventRow): AgentEventRead {
  let payload: Record<string, any> = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    session_id: row.session_id,
    event_type: row.event_type,
    payload,
    created_at: row.created_at,
  };
}

/** 列出指定会话的事件流（按 created_at 升序） */
export function listEventsBySession(
  tenantId: string,
  sessionId: string,
): AgentEventRow[] {
  const db = initDb();
  return db
    .prepare(
      'SELECT * FROM sd_agent_events WHERE tenant_id = ? AND session_id = ? ORDER BY created_at ASC',
    )
    .all(tenantId, sessionId) as AgentEventRow[];
}

/** 列出指定会话的事件流（按 created_at 降序，最新在前，用于追踪汇总） */
export function listEventsBySessionDesc(
  tenantId: string,
  sessionId: string,
  limit: number = 30,
): AgentEventRow[] {
  const db = initDb();
  return db
    .prepare(
      'SELECT * FROM sd_agent_events WHERE tenant_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(tenantId, sessionId, limit) as AgentEventRow[];
}

/** 创建事件 */
export function createEvent(
  tenantId: string,
  sessionId: string,
  eventType: string,
  payload: Record<string, any> = {},
): AgentEventRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.event);
  const ts = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO sd_agent_events (id, tenant_id, session_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, tenantId, sessionId, eventType, JSON.stringify(payload), ts);
  return db.prepare('SELECT * FROM sd_agent_events WHERE id = ?').get(id) as AgentEventRow;
}

/** 删除指定会话的全部事件 */
export function deleteEventsBySession(tenantId: string, sessionId: string): number {
  const db = initDb();
  const r = db
    .prepare('DELETE FROM sd_agent_events WHERE tenant_id = ? AND session_id = ?')
    .run(tenantId, sessionId);
  return r.changes;
}
