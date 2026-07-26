/**
 * StaffDeck Scheduled Task DAO — sd_scheduled_tasks + sd_scheduled_task_runs CRUD
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { ScheduledTaskRow, ScheduledTaskRunRow } from '../../types/staff.js';

// ===================== Tasks 查询 =====================

interface ListTasksFilter {
  agent_id?: string;
  status?: string;
  created_by_user_id?: string;
}

/** 列出定时任务 */
export function listScheduledTasks(
  tenantId: string = DEFAULT_TENANT_ID,
  filter: ListTasksFilter = {},
): ScheduledTaskRow[] {
  const db = initDb();
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.agent_id) {
    conditions.push('agent_id = ?');
    params.push(filter.agent_id);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.created_by_user_id) {
    conditions.push('created_by_user_id = ?');
    params.push(filter.created_by_user_id);
  }
  return db
    .prepare(
      `SELECT * FROM sd_scheduled_tasks WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`,
    )
    .all(...params) as ScheduledTaskRow[];
}

/** 按 ID 获取单个任务 */
export function getScheduledTaskById(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
): ScheduledTaskRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_scheduled_tasks WHERE tenant_id = ? AND id = ?')
    .get(tenantId, taskId) as ScheduledTaskRow | undefined;
}

// ===================== Tasks 写入 =====================

interface CreateScheduledTaskData {
  tenant_id?: string;
  agent_id: string;
  created_by_user_id?: string | null;
  title: string;
  prompt: string;
  description?: string | null;
  schedule_type?: string;
  schedule?: Record<string, unknown>;
  timezone?: string;
  rrule?: string | null;
  status?: string;
  concurrency_policy?: string;
  misfire_policy?: string;
  max_runs?: number | null;
  end_at?: number | null;
  next_run_at?: number | null;
  source_session_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** 创建定时任务 */
export function createScheduledTask(data: CreateScheduledTaskData): ScheduledTaskRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.scheduledTask);
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  db.prepare(
    `INSERT INTO sd_scheduled_tasks (
      id, tenant_id, agent_id, created_by_user_id, title, prompt, description,
      schedule_type, schedule_json, timezone, rrule, status,
      concurrency_policy, misfire_policy, max_runs, end_at, next_run_at,
      run_count, source_session_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.agent_id,
    data.created_by_user_id ?? null,
    data.title,
    data.prompt,
    data.description ?? null,
    data.schedule_type || 'daily',
    JSON.stringify(data.schedule ?? {}),
    data.timezone || 'Asia/Shanghai',
    data.rrule ?? null,
    data.status || 'active',
    data.concurrency_policy || 'forbid',
    data.misfire_policy || 'coalesce',
    data.max_runs ?? null,
    data.end_at ?? null,
    data.next_run_at ?? null,
    0,
    data.source_session_id ?? null,
    JSON.stringify(data.metadata ?? {}),
  );
  return db.prepare('SELECT * FROM sd_scheduled_tasks WHERE id = ?').get(id) as ScheduledTaskRow;
}

interface UpdateScheduledTaskData {
  title?: string;
  prompt?: string;
  description?: string | null;
  schedule_type?: string;
  schedule?: Record<string, unknown>;
  timezone?: string;
  rrule?: string | null;
  status?: string;
  concurrency_policy?: string;
  misfire_policy?: string;
  max_runs?: number | null;
  end_at?: number | null;
  next_run_at?: number | null;
  last_run_at?: number | null;
  last_status?: string | null;
  run_count?: number;
  metadata?: Record<string, unknown>;
}

/** 更新定时任务（部分更新） */
export function updateScheduledTask(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
  updates: UpdateScheduledTaskData,
): ScheduledTaskRow | undefined {
  const db = initDb();
  const existing = getScheduledTaskById(tenantId, taskId);
  if (!existing) return undefined;

  const setClauses: string[] = ['updated_at = CAST(strftime(\'%s\',\'now\') AS INTEGER)'];
  const params: unknown[] = [];

  if (updates.title !== undefined) { setClauses.push('title = ?'); params.push(updates.title); }
  if (updates.prompt !== undefined) { setClauses.push('prompt = ?'); params.push(updates.prompt); }
  if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description); }
  if (updates.schedule_type !== undefined) { setClauses.push('schedule_type = ?'); params.push(updates.schedule_type); }
  if (updates.schedule !== undefined) { setClauses.push('schedule_json = ?'); params.push(JSON.stringify(updates.schedule)); }
  if (updates.timezone !== undefined) { setClauses.push('timezone = ?'); params.push(updates.timezone); }
  if (updates.rrule !== undefined) { setClauses.push('rrule = ?'); params.push(updates.rrule); }
  if (updates.status !== undefined) { setClauses.push('status = ?'); params.push(updates.status); }
  if (updates.concurrency_policy !== undefined) { setClauses.push('concurrency_policy = ?'); params.push(updates.concurrency_policy); }
  if (updates.misfire_policy !== undefined) { setClauses.push('misfire_policy = ?'); params.push(updates.misfire_policy); }
  if (updates.max_runs !== undefined) { setClauses.push('max_runs = ?'); params.push(updates.max_runs); }
  if (updates.end_at !== undefined) { setClauses.push('end_at = ?'); params.push(updates.end_at); }
  if (updates.next_run_at !== undefined) { setClauses.push('next_run_at = ?'); params.push(updates.next_run_at); }
  if (updates.last_run_at !== undefined) { setClauses.push('last_run_at = ?'); params.push(updates.last_run_at); }
  if (updates.last_status !== undefined) { setClauses.push('last_status = ?'); params.push(updates.last_status); }
  if (updates.run_count !== undefined) { setClauses.push('run_count = ?'); params.push(updates.run_count); }
  if (updates.metadata !== undefined) { setClauses.push('metadata_json = ?'); params.push(JSON.stringify(updates.metadata)); }

  params.push(tenantId, taskId);
  db.prepare(`UPDATE sd_scheduled_tasks SET ${setClauses.join(', ')} WHERE tenant_id = ? AND id = ?`).run(...params);
  return getScheduledTaskById(tenantId, taskId);
}

/** 归档任务（软删除） */
export function archiveScheduledTask(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
): ScheduledTaskRow | undefined {
  return updateScheduledTask(tenantId, taskId, { status: 'archived', next_run_at: null });
}

/** 物理删除任务 */
export function deleteScheduledTask(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
): boolean {
  const db = initDb();
  db.prepare('DELETE FROM sd_scheduled_task_runs WHERE tenant_id = ? AND scheduled_task_id = ?').run(tenantId, taskId);
  const result = db
    .prepare('DELETE FROM sd_scheduled_tasks WHERE tenant_id = ? AND id = ?')
    .run(tenantId, taskId);
  return result.changes > 0;
}

// ===================== Runs 查询 =====================

interface ListRunsFilter {
  agent_id?: string;
  status?: string;
  user_id?: string;
  scheduled_task_id?: string;
}

/** 列出所有任务的执行历史（带可选过滤） */
export function listAllRuns(
  tenantId: string = DEFAULT_TENANT_ID,
  filter: ListRunsFilter = {},
  limit: number = 100,
): ScheduledTaskRunRow[] {
  const db = initDb();
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];
  if (filter.agent_id) { conditions.push('agent_id = ?'); params.push(filter.agent_id); }
  if (filter.status) { conditions.push('status = ?'); params.push(filter.status); }
  if (filter.user_id) { conditions.push('user_id = ?'); params.push(filter.user_id); }
  if (filter.scheduled_task_id) { conditions.push('scheduled_task_id = ?'); params.push(filter.scheduled_task_id); }
  params.push(limit);
  return db
    .prepare(
      `SELECT * FROM sd_scheduled_task_runs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params) as ScheduledTaskRunRow[];
}

/** 列出单个任务的执行历史 */
export function listRunsForTask(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
): ScheduledTaskRunRow[] {
  const db = initDb();
  return db
    .prepare(
      'SELECT * FROM sd_scheduled_task_runs WHERE tenant_id = ? AND scheduled_task_id = ? ORDER BY scheduled_for DESC',
    )
    .all(tenantId, taskId) as ScheduledTaskRunRow[];
}

// ===================== Runs 写入 =====================

interface CreateRunData {
  tenant_id?: string;
  scheduled_task_id: string;
  agent_id: string;
  user_id?: string | null;
  session_id?: string | null;
  scheduled_for: number;
  status?: string;
  started_at?: number | null;
  finished_at?: number | null;
  result_summary?: string | null;
  error?: string | null;
  trace?: Record<string, unknown>;
}

/** 创建执行记录 */
export function createRun(data: CreateRunData): ScheduledTaskRunRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.scheduledTaskRun);
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  db.prepare(
    `INSERT INTO sd_scheduled_task_runs (
      id, tenant_id, scheduled_task_id, agent_id, user_id, session_id,
      scheduled_for, status, started_at, finished_at, result_summary, error, trace_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.scheduled_task_id,
    data.agent_id,
    data.user_id ?? null,
    data.session_id ?? null,
    data.scheduled_for,
    data.status || 'queued',
    data.started_at ?? null,
    data.finished_at ?? null,
    data.result_summary ?? null,
    data.error ?? null,
    JSON.stringify(data.trace ?? {}),
  );
  return db.prepare('SELECT * FROM sd_scheduled_task_runs WHERE id = ?').get(id) as ScheduledTaskRunRow;
}

/** 更新执行记录 */
export function updateRun(
  tenantId: string = DEFAULT_TENANT_ID,
  runId: string,
  updates: Partial<Pick<ScheduledTaskRunRow, 'status' | 'started_at' | 'finished_at' | 'result_summary' | 'error' | 'session_id'>>,
): ScheduledTaskRunRow | undefined {
  const db = initDb();
  const setClauses: string[] = ['updated_at = CAST(strftime(\'%s\',\'now\') AS INTEGER)'];
  const params: unknown[] = [];
  if (updates.status !== undefined) { setClauses.push('status = ?'); params.push(updates.status); }
  if (updates.started_at !== undefined) { setClauses.push('started_at = ?'); params.push(updates.started_at); }
  if (updates.finished_at !== undefined) { setClauses.push('finished_at = ?'); params.push(updates.finished_at); }
  if (updates.result_summary !== undefined) { setClauses.push('result_summary = ?'); params.push(updates.result_summary); }
  if (updates.error !== undefined) { setClauses.push('error = ?'); params.push(updates.error); }
  if (updates.session_id !== undefined) { setClauses.push('session_id = ?'); params.push(updates.session_id); }
  params.push(tenantId, runId);
  db.prepare(`UPDATE sd_scheduled_task_runs SET ${setClauses.join(', ')} WHERE tenant_id = ? AND id = ?`).run(...params);
  return db
    .prepare('SELECT * FROM sd_scheduled_task_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, runId) as ScheduledTaskRunRow | undefined;
}
