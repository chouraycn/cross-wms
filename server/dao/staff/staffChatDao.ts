/**
 * StaffChatDao — ChatSession + Message + HumanHandoffRequest CRUD
 *
 * 涉及表：sd_sessions, sd_messages, sd_human_handoff_requests
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID, newStaffId, StaffIdPrefix } from '../../db-staff.js';
import type {
  ChatSessionRow,
  ChatSessionRead,
  MessageRow,
  MessageRead,
  HumanHandoffRequestRow,
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

function safeJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonAny(raw: string | null | undefined): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ===================== Sessions =====================

export function toSessionRead(row: ChatSessionRow): ChatSessionRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    agent_id: row.agent_id,
    title: row.title,
    active_skill_id: row.active_skill_id,
    active_step_id: row.active_step_id,
    slots: safeJsonObj(row.slots_json),
    skill_stack: safeJsonArray(row.skill_stack_json),
    pending_tasks: safeJsonArray(row.pending_tasks_json),
    resume_after_answer: safeJsonAny(row.resume_after_answer_json),
    awaiting_input: safeJsonAny(row.awaiting_input_json),
    knowledge_context: safeJsonArray(row.knowledge_context_json),
    context_state: safeJsonObj(row.context_state_json),
    summary: row.summary,
    last_agent_question: row.last_agent_question,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface SessionListFilter {
  tenantId?: string;
  userId?: string;
  agentId?: string;
  status?: string;
  search?: string;
}

export function listSessions(filter: SessionListFilter = {}): ChatSessionRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.userId) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }
  if (filter.agentId) {
    conditions.push('agent_id = ?');
    params.push(filter.agentId);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.search && filter.search.trim() !== '') {
    conditions.push('(title LIKE ? OR summary LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  const sql = `SELECT * FROM sd_sessions WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`;
  return db.prepare(sql).all(...params) as ChatSessionRow[];
}

export function getSessionById(
  tenantId: string,
  sessionId: string,
): ChatSessionRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_sessions WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, sessionId) as ChatSessionRow | undefined;
}

export interface SessionInput {
  tenant_id?: string;
  user_id?: string | null;
  agent_id?: string | null;
  title?: string | null;
  active_skill_id?: string | null;
  active_step_id?: string | null;
  slots?: Record<string, unknown>;
  skill_stack?: unknown[];
  pending_tasks?: unknown[];
  resume_after_answer?: unknown | null;
  awaiting_input?: unknown | null;
  knowledge_context?: unknown[];
  context_state?: Record<string, unknown>;
  summary?: string | null;
  last_agent_question?: string | null;
  status?: string;
}

export function createSession(input: SessionInput): ChatSessionRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.session);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_sessions
       (id, tenant_id, user_id, agent_id, title, active_skill_id, active_step_id,
        slots_json, skill_stack_json, pending_tasks_json, resume_after_answer_json,
        awaiting_input_json, knowledge_context_json, context_state_json,
        summary, last_agent_question, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.user_id ?? null,
    input.agent_id ?? null,
    input.title ?? null,
    input.active_skill_id ?? null,
    input.active_step_id ?? null,
    JSON.stringify(input.slots ?? {}),
    JSON.stringify(input.skill_stack ?? []),
    JSON.stringify(input.pending_tasks ?? []),
    input.resume_after_answer ? JSON.stringify(input.resume_after_answer) : null,
    input.awaiting_input ? JSON.stringify(input.awaiting_input) : null,
    JSON.stringify(input.knowledge_context ?? []),
    JSON.stringify(input.context_state ?? {}),
    input.summary ?? null,
    input.last_agent_question ?? null,
    input.status ?? 'active',
    ts,
    ts,
  );
  return db.prepare(`SELECT * FROM sd_sessions WHERE id = ?`).get(id) as ChatSessionRow;
}

export interface SessionUpdateInput {
  title?: string | null;
  active_skill_id?: string | null;
  active_step_id?: string | null;
  slots?: Record<string, unknown>;
  skill_stack?: unknown[];
  pending_tasks?: unknown[];
  resume_after_answer?: unknown | null;
  awaiting_input?: unknown | null;
  knowledge_context?: unknown[];
  context_state?: Record<string, unknown>;
  summary?: string | null;
  last_agent_question?: string | null;
  status?: string;
  agent_id?: string | null;
}

export function updateSession(
  tenantId: string,
  sessionId: string,
  patch: SessionUpdateInput,
): ChatSessionRow | null {
  const db = initDb();
  const existing = getSessionById(tenantId, sessionId);
  if (!existing) return null;
  const ts = now();
  const next: ChatSessionRow = {
    ...existing,
    title: patch.title !== undefined ? patch.title : existing.title,
    active_skill_id:
      patch.active_skill_id !== undefined ? patch.active_skill_id : existing.active_skill_id,
    active_step_id:
      patch.active_step_id !== undefined ? patch.active_step_id : existing.active_step_id,
    slots_json: patch.slots !== undefined ? JSON.stringify(patch.slots) : existing.slots_json,
    skill_stack_json:
      patch.skill_stack !== undefined ? JSON.stringify(patch.skill_stack) : existing.skill_stack_json,
    pending_tasks_json:
      patch.pending_tasks !== undefined
        ? JSON.stringify(patch.pending_tasks)
        : existing.pending_tasks_json,
    resume_after_answer_json:
      patch.resume_after_answer !== undefined
        ? patch.resume_after_answer
          ? JSON.stringify(patch.resume_after_answer)
          : null
        : existing.resume_after_answer_json,
    awaiting_input_json:
      patch.awaiting_input !== undefined
        ? patch.awaiting_input
          ? JSON.stringify(patch.awaiting_input)
          : null
        : existing.awaiting_input_json,
    knowledge_context_json:
      patch.knowledge_context !== undefined
        ? JSON.stringify(patch.knowledge_context)
        : existing.knowledge_context_json,
    context_state_json:
      patch.context_state !== undefined
        ? JSON.stringify(patch.context_state)
        : existing.context_state_json,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    last_agent_question:
      patch.last_agent_question !== undefined
        ? patch.last_agent_question
        : existing.last_agent_question,
    status: patch.status ?? existing.status,
    agent_id: patch.agent_id !== undefined ? patch.agent_id : existing.agent_id,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_sessions
     SET title = ?, active_skill_id = ?, active_step_id = ?, slots_json = ?, skill_stack_json = ?,
         pending_tasks_json = ?, resume_after_answer_json = ?, awaiting_input_json = ?,
         knowledge_context_json = ?, context_state_json = ?, summary = ?,
         last_agent_question = ?, status = ?, agent_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.active_skill_id,
    next.active_step_id,
    next.slots_json,
    next.skill_stack_json,
    next.pending_tasks_json,
    next.resume_after_answer_json,
    next.awaiting_input_json,
    next.knowledge_context_json,
    next.context_state_json,
    next.summary,
    next.last_agent_question,
    next.status,
    next.agent_id,
    next.updated_at,
    existing.id,
  );
  return next;
}

export function deleteSession(tenantId: string, sessionId: string): boolean {
  const db = initDb();
  const existing = getSessionById(tenantId, sessionId);
  if (!existing) return false;
  db.prepare(`DELETE FROM sd_messages WHERE tenant_id = ? AND session_id = ?`).run(tenantId, sessionId);
  db.prepare(`DELETE FROM sd_human_handoff_requests WHERE tenant_id = ? AND session_id = ?`)
    .run(tenantId, sessionId);
  db.prepare(`DELETE FROM sd_agent_events WHERE tenant_id = ? AND session_id = ?`)
    .run(tenantId, sessionId);
  db.prepare(`DELETE FROM sd_sessions WHERE id = ?`).run(existing.id);
  return true;
}

// ===================== Messages =====================

export function toMessageRead(row: MessageRow): MessageRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    session_id: row.session_id,
    role: row.role,
    content: row.content,
    metadata: safeJsonObj(row.metadata_json),
    created_at: row.created_at,
  };
}

export function listMessages(
  tenantId: string,
  sessionId: string,
  limit: number = 100,
): MessageRow[] {
  const db = initDb();
  return db
    .prepare(
      `SELECT * FROM sd_messages WHERE tenant_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT ?`,
    )
    .all(tenantId, sessionId, limit) as MessageRow[];
}

export function getMessageById(
  tenantId: string,
  messageId: string,
): MessageRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_messages WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, messageId) as MessageRow | undefined;
}

export interface MessageInput {
  tenant_id?: string;
  session_id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export function createMessage(input: MessageInput): MessageRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.message);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_messages
       (id, tenant_id, session_id, role, content, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.session_id,
    input.role,
    input.content,
    JSON.stringify(input.metadata ?? {}),
    ts,
  );
  // 更新 session 的 updated_at
  db.prepare(`UPDATE sd_sessions SET updated_at = ? WHERE id = ?`).run(ts, input.session_id);
  return db.prepare(`SELECT * FROM sd_messages WHERE id = ?`).get(id) as MessageRow;
}

export function deleteMessage(tenantId: string, messageId: string): boolean {
  const db = initDb();
  const r = db
    .prepare(`DELETE FROM sd_messages WHERE tenant_id = ? AND id = ?`)
    .run(tenantId, messageId);
  return r.changes > 0;
}

// ===================== Human Handoff Requests =====================

export function listHandoffs(
  tenantId: string,
  status?: string,
): HumanHandoffRequestRow[] {
  const db = initDb();
  if (status) {
    return db
      .prepare(
        `SELECT * FROM sd_human_handoff_requests WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC`,
      )
      .all(tenantId, status) as HumanHandoffRequestRow[];
  }
  return db
    .prepare(`SELECT * FROM sd_human_handoff_requests WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId) as HumanHandoffRequestRow[];
}

export function getHandoffById(
  tenantId: string,
  handoffId: string,
): HumanHandoffRequestRow | undefined {
  const db = initDb();
  return db
    .prepare(`SELECT * FROM sd_human_handoff_requests WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, handoffId) as HumanHandoffRequestRow | undefined;
}

export interface HandoffInput {
  tenant_id?: string;
  session_id: string;
  agent_id: string;
  requester_user_id?: string | null;
  assignee_user_id?: string | null;
  trigger_skill_id?: string | null;
  trigger_step_id?: string | null;
  context_summary?: string | null;
  pending_question?: string | null;
  status?: string;
  human_reply?: string | null;
  resume_payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function createHandoff(input: HandoffInput): HumanHandoffRequestRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.handoff);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_human_handoff_requests
       (id, tenant_id, session_id, agent_id, requester_user_id, assignee_user_id,
        trigger_skill_id, trigger_step_id, context_summary, pending_question, status,
        human_reply, resume_payload_json, metadata_json, answered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.session_id,
    input.agent_id,
    input.requester_user_id ?? null,
    input.assignee_user_id ?? null,
    input.trigger_skill_id ?? null,
    input.trigger_step_id ?? null,
    input.context_summary ?? null,
    input.pending_question ?? null,
    input.status ?? 'pending',
    input.human_reply ?? null,
    JSON.stringify(input.resume_payload ?? {}),
    JSON.stringify(input.metadata ?? {}),
    ts,
    ts,
  );
  return db
    .prepare(`SELECT * FROM sd_human_handoff_requests WHERE id = ?`)
    .get(id) as HumanHandoffRequestRow;
}

export interface HandoffReplyInput {
  human_reply: string;
  assignee_user_id?: string | null;
  status?: string;
  resume_payload?: Record<string, unknown>;
}

export function replyHandoff(
  tenantId: string,
  handoffId: string,
  input: HandoffReplyInput,
): HumanHandoffRequestRow | null {
  const db = initDb();
  const existing = getHandoffById(tenantId, handoffId);
  if (!existing) return null;
  const ts = now();
  db.prepare(
    `UPDATE sd_human_handoff_requests
     SET human_reply = ?, assignee_user_id = ?, status = ?, resume_payload_json = ?,
         answered_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.human_reply,
    input.assignee_user_id ?? existing.assignee_user_id,
    input.status ?? 'answered',
    JSON.stringify(input.resume_payload ?? safeJsonObj(existing.resume_payload_json)),
    ts,
    ts,
    existing.id,
  );
  return getHandoffById(tenantId, handoffId) ?? null;
}
