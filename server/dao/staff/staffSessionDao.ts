/**
 * StaffSessionDao — sd_sessions + sd_messages 表 CRUD
 *
 * 设计：
 * - JSON 字段（slots_json, skill_stack_json, pending_tasks_json 等）以 TEXT 存储
 * - row -> read 时反序列化为对象/数组
 * - 时间字段使用 INTEGER（Unix 秒）
 * - 提供 reset 用于清空会话运行时状态
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type {
  ChatSessionRow,
  ChatSessionRead,
  MessageRow,
  MessageRead,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

/** row -> read（含 JSON 反序列化） */
export function toSessionRead(row: ChatSessionRow): ChatSessionRead {
  let slots: Record<string, any> = {};
  try {
    slots = row.slots_json ? JSON.parse(row.slots_json) : {};
  } catch {
    slots = {};
  }
  let skillStack: any[] = [];
  try {
    skillStack = row.skill_stack_json ? JSON.parse(row.skill_stack_json) : [];
  } catch {
    skillStack = [];
  }
  let pendingTasks: any[] = [];
  try {
    pendingTasks = row.pending_tasks_json ? JSON.parse(row.pending_tasks_json) : [];
  } catch {
    pendingTasks = [];
  }
  let knowledgeContext: any[] = [];
  try {
    knowledgeContext = row.knowledge_context_json ? JSON.parse(row.knowledge_context_json) : [];
  } catch {
    knowledgeContext = [];
  }
  let contextState: Record<string, any> = {};
  try {
    contextState = row.context_state_json ? JSON.parse(row.context_state_json) : {};
  } catch {
    contextState = {};
  }
  let resumeAfterAnswer: any = null;
  if (row.resume_after_answer_json) {
    try {
      resumeAfterAnswer = JSON.parse(row.resume_after_answer_json);
    } catch {
      resumeAfterAnswer = null;
    }
  }
  let awaitingInput: any = null;
  if (row.awaiting_input_json) {
    try {
      awaitingInput = JSON.parse(row.awaiting_input_json);
    } catch {
      awaitingInput = null;
    }
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    agent_id: row.agent_id,
    title: row.title,
    active_skill_id: row.active_skill_id,
    active_step_id: row.active_step_id,
    slots,
    skill_stack: skillStack,
    pending_tasks: pendingTasks,
    resume_after_answer: resumeAfterAnswer,
    awaiting_input: awaitingInput,
    knowledge_context: knowledgeContext,
    context_state: contextState,
    summary: row.summary,
    last_agent_question: row.last_agent_question,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** row -> read（含 metadata 反序列化） */
export function toMessageRead(row: MessageRow): MessageRead {
  let metadata: Record<string, any> = {};
  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    session_id: row.session_id,
    role: row.role,
    content: row.content,
    metadata,
    created_at: row.created_at,
  };
}

// ===================== Sessions =====================

export interface SessionListFilter {
  tenantId?: string;
  userId?: string;
  agentId?: string;
  status?: string;
}

/** 列出会话（按 updated_at 降序） */
export function listSessions(filter: SessionListFilter = {}): ChatSessionRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];
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
  const whereClause = conditions.join(' AND ');
  return db
    .prepare(`SELECT * FROM sd_sessions WHERE ${whereClause} ORDER BY updated_at DESC`)
    .all(...params) as ChatSessionRow[];
}

/** 按 id 获取单个会话 */
export function getSessionById(
  tenantId: string,
  sessionId: string,
): ChatSessionRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_sessions WHERE tenant_id = ? AND id = ?')
    .get(tenantId, sessionId) as ChatSessionRow | undefined;
}

export interface SessionCreateInput {
  tenant_id?: string;
  user_id?: string;
  agent_id?: string;
  title?: string;
  status?: string;
}

/** 创建会话 */
export function createSession(input: SessionCreateInput): ChatSessionRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.session);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_sessions
       (id, tenant_id, user_id, agent_id, title, active_skill_id, active_step_id,
        slots_json, skill_stack_json, pending_tasks_json, resume_after_answer_json,
        awaiting_input_json, knowledge_context_json, context_state_json, summary,
        last_agent_question, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, '{}', '[]', '[]', NULL, NULL, '[]', '{}', NULL, NULL, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.user_id ?? null,
    input.agent_id ?? null,
    input.title ?? null,
    input.status ?? 'active',
    ts,
    ts,
  );
  return db.prepare('SELECT * FROM sd_sessions WHERE id = ?').get(id) as ChatSessionRow;
}

export interface SessionUpdateInput {
  agent_id?: string | null;
  title?: string | null;
  active_skill_id?: string | null;
  active_step_id?: string | null;
  slots?: Record<string, any>;
  skill_stack?: any[];
  pending_tasks?: any[];
  resume_after_answer?: any | null;
  awaiting_input?: any | null;
  knowledge_context?: any[];
  context_state?: Record<string, any>;
  summary?: string | null;
  last_agent_question?: string | null;
  status?: string;
}

/** 更新会话（部分字段） */
export function updateSession(
  tenantId: string,
  sessionId: string,
  patch: SessionUpdateInput,
): ChatSessionRow | null {
  const db = initDb();
  const existing = getSessionById(tenantId, sessionId);
  if (!existing) return null;

  const next: ChatSessionRow = {
    ...existing,
    agent_id: patch.agent_id !== undefined ? patch.agent_id : existing.agent_id,
    title: patch.title !== undefined ? patch.title : existing.title,
    active_skill_id:
      patch.active_skill_id !== undefined ? patch.active_skill_id : existing.active_skill_id,
    active_step_id:
      patch.active_step_id !== undefined ? patch.active_step_id : existing.active_step_id,
    slots_json:
      patch.slots !== undefined ? JSON.stringify(patch.slots) : existing.slots_json,
    skill_stack_json:
      patch.skill_stack !== undefined
        ? JSON.stringify(patch.skill_stack)
        : existing.skill_stack_json,
    pending_tasks_json:
      patch.pending_tasks !== undefined
        ? JSON.stringify(patch.pending_tasks)
        : existing.pending_tasks_json,
    resume_after_answer_json:
      patch.resume_after_answer !== undefined
        ? patch.resume_after_answer === null
          ? null
          : JSON.stringify(patch.resume_after_answer)
        : existing.resume_after_answer_json,
    awaiting_input_json:
      patch.awaiting_input !== undefined
        ? patch.awaiting_input === null
          ? null
          : JSON.stringify(patch.awaiting_input)
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
    updated_at: now(),
  };

  db.prepare(
    `UPDATE sd_sessions
     SET agent_id = ?, title = ?, active_skill_id = ?, active_step_id = ?,
         slots_json = ?, skill_stack_json = ?, pending_tasks_json = ?,
         resume_after_answer_json = ?, awaiting_input_json = ?,
         knowledge_context_json = ?, context_state_json = ?,
         summary = ?, last_agent_question = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.agent_id,
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
    next.updated_at,
    sessionId,
  );

  return next;
}

/** 重置会话运行时状态（清空技能栈/槽位/待办/摘要，状态置为 active） */
export function resetSession(
  tenantId: string,
  sessionId: string,
): ChatSessionRow | null {
  const db = initDb();
  const existing = getSessionById(tenantId, sessionId);
  if (!existing) return null;

  const ts = now();
  db.prepare(
    `UPDATE sd_sessions
     SET active_skill_id = NULL, active_step_id = NULL,
         slots_json = '{}', skill_stack_json = '[]', pending_tasks_json = '[]',
         resume_after_answer_json = NULL, summary = NULL, last_agent_question = NULL,
         status = 'active', updated_at = ?
     WHERE id = ?`,
  ).run(ts, sessionId);

  return { ...existing, active_skill_id: null, active_step_id: null, slots_json: '{}', skill_stack_json: '[]', pending_tasks_json: '[]', resume_after_answer_json: null, summary: null, last_agent_question: null, status: 'active', updated_at: ts };
}

/** 删除会话（连带删除消息和事件由调用方负责） */
export function deleteSession(tenantId: string, sessionId: string): boolean {
  const db = initDb();
  const r = db
    .prepare('DELETE FROM sd_sessions WHERE tenant_id = ? AND id = ?')
    .run(tenantId, sessionId);
  return r.changes > 0;
}

// ===================== Messages =====================

/** 列出指定会话的全部消息（按 created_at 升序） */
export function listMessagesBySession(
  tenantId: string,
  sessionId: string,
): MessageRow[] {
  const db = initDb();
  return db
    .prepare(
      'SELECT * FROM sd_messages WHERE tenant_id = ? AND session_id = ? ORDER BY created_at ASC',
    )
    .all(tenantId, sessionId) as MessageRow[];
}

/** 按 id 获取单条消息 */
export function getMessageById(
  tenantId: string,
  messageId: string,
): MessageRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_messages WHERE tenant_id = ? AND id = ?')
    .get(tenantId, messageId) as MessageRow | undefined;
}

/** 创建消息 */
export function createMessage(
  tenantId: string,
  sessionId: string,
  role: string,
  content: string,
  metadata: Record<string, any> = {},
): MessageRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.message);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_messages (id, tenant_id, session_id, role, content, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tenantId, sessionId, role, content, JSON.stringify(metadata), ts);
  return db.prepare('SELECT * FROM sd_messages WHERE id = ?').get(id) as MessageRow;
}
