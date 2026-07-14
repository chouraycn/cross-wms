import { initDb } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkerType = 'agent' | 'human' | 'system';
export type WorkerStatus = 'idle' | 'busy' | 'offline';

export interface WorkboardTask {
  id: string;
  sessionId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  orderIndex: number;
  parentTaskId: string | null;
  assignedTo: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  result: unknown | null;
  error: string | null;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkboardWorker {
  id: string;
  name: string;
  type: WorkerType;
  status: WorkerStatus;
  currentTaskId: string | null;
  lastHeartbeat: string | null;
  createdAt: string;
}

function db() {
  return initDb();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTaskRow(row: Record<string, unknown>): WorkboardTask {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    orderIndex: Number(row.order_index),
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    result: row.result ? (() => { try { return JSON.parse(String(row.result)); } catch { return row.result; } })() : null,
    error: row.error ? String(row.error) : null,
    dependsOn: row.depends_on ? JSON.parse(String(row.depends_on)) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeWorkerRow(row: Record<string, unknown>): WorkboardWorker {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as WorkerType,
    status: row.status as WorkerStatus,
    currentTaskId: row.current_task_id ? String(row.current_task_id) : null,
    lastHeartbeat: row.last_heartbeat ? String(row.last_heartbeat) : null,
    createdAt: String(row.created_at),
  };
}

// ===================== Tasks =====================

export function findTasksBySession(sessionId: string): WorkboardTask[] {
  const rows = db()
    .prepare('SELECT * FROM workboard_tasks WHERE session_id = ? ORDER BY order_index ASC, created_at DESC')
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskRow);
}

export function findTaskById(id: string): WorkboardTask | undefined {
  const row = db().prepare('SELECT * FROM workboard_tasks WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeTaskRow(row) : undefined;
}

export function findSubtasks(parentTaskId: string): WorkboardTask[] {
  const rows = db()
    .prepare('SELECT * FROM workboard_tasks WHERE parent_task_id = ? ORDER BY order_index ASC, created_at ASC')
    .all(parentTaskId) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskRow);
}

export function createTask(data: {
  sessionId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  orderIndex?: number;
  parentTaskId?: string;
  assignedTo?: string;
  dependsOn?: string[];
  result?: unknown;
  error?: string;
}): WorkboardTask {
  const id = uuidv4();
  const now = nowIso();
  const status = data.status || 'pending';
  db()
    .prepare(
      `INSERT INTO workboard_tasks 
       (id, session_id, title, description, status, priority, order_index, parent_task_id, 
        assigned_to, claimed_at, started_at, completed_at, result, error, depends_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.sessionId,
      data.title,
      data.description || null,
      status,
      data.priority || 'normal',
      data.orderIndex ?? 0,
      data.parentTaskId || null,
      data.assignedTo || null,
      null,
      status === 'in_progress' ? now : null,
      status === 'done' ? now : null,
      data.result !== undefined ? JSON.stringify(data.result) : null,
      data.error || null,
      data.dependsOn && data.dependsOn.length > 0 ? JSON.stringify(data.dependsOn) : null,
      now,
      now
    );
  return findTaskById(id)!;
}

export function updateTask(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    orderIndex: number;
    parentTaskId: string;
    assignedTo: string;
    dependsOn: string[];
    result: unknown;
    error: string;
  }>
): WorkboardTask | undefined {
  const existing = findTaskById(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const vals: unknown[] = [];
  const now = nowIso();

  if (data.title !== undefined) {
    fields.push('title = ?');
    vals.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    vals.push(data.description);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    vals.push(data.status);
    if (data.status === 'in_progress' && !existing.startedAt) {
      fields.push('started_at = ?');
      vals.push(now);
    }
    if (data.status === 'done') {
      fields.push('completed_at = ?');
      vals.push(now);
    } else if (existing.completedAt) {
      fields.push('completed_at = ?');
      vals.push(null);
    }
  }
  if (data.priority !== undefined) {
    fields.push('priority = ?');
    vals.push(data.priority);
  }
  if (data.orderIndex !== undefined) {
    fields.push('order_index = ?');
    vals.push(data.orderIndex);
  }
  if (data.parentTaskId !== undefined) {
    fields.push('parent_task_id = ?');
    vals.push(data.parentTaskId || null);
  }
  if (data.assignedTo !== undefined) {
    fields.push('assigned_to = ?');
    vals.push(data.assignedTo || null);
  }
  if (data.dependsOn !== undefined) {
    fields.push('depends_on = ?');
    vals.push(data.dependsOn.length > 0 ? JSON.stringify(data.dependsOn) : null);
  }
  if (data.result !== undefined) {
    fields.push('result = ?');
    vals.push(data.result !== null ? JSON.stringify(data.result) : null);
  }
  if (data.error !== undefined) {
    fields.push('error = ?');
    vals.push(data.error || null);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  vals.push(now);
  vals.push(id);

  db().prepare(`UPDATE workboard_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return findTaskById(id);
}

export function deleteTask(id: string): boolean {
  const result = db().prepare('DELETE FROM workboard_tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function claimTask(taskId: string, workerId: string): WorkboardTask | undefined {
  const task = findTaskById(taskId);
  if (!task) return undefined;
  if (task.status !== 'pending') return undefined;
  if (task.assignedTo && task.assignedTo !== workerId) return undefined;

  const now = nowIso();
  db()
    .prepare(
      `UPDATE workboard_tasks 
       SET status = 'in_progress', assigned_to = ?, claimed_at = ?, started_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(workerId, now, now, now, taskId);

  const worker = findWorkerById(workerId);
  if (worker) {
    updateWorker(workerId, { status: 'busy', currentTaskId: taskId });
  }

  return findTaskById(taskId);
}

export function completeTask(taskId: string, result?: unknown): WorkboardTask | undefined {
  const task = findTaskById(taskId);
  if (!task) return undefined;
  if (task.status === 'done' || task.status === 'cancelled') return task;

  const now = nowIso();
  const fields = ['status = ?', 'completed_at = ?', 'updated_at = ?'];
  const vals: unknown[] = ['done', now, now];

  if (result !== undefined) {
    fields.push('result = ?');
    vals.push(JSON.stringify(result));
  }

  vals.push(taskId);

  db()
    .prepare(`UPDATE workboard_tasks SET ${fields.join(', ')} WHERE id = ?`)
    .run(...vals);

  if (task.assignedTo) {
    const worker = findWorkerById(task.assignedTo);
    if (worker && worker.currentTaskId === taskId) {
      updateWorker(task.assignedTo, { status: 'idle', currentTaskId: undefined });
    }
  }

  return findTaskById(taskId);
}

export function releaseTask(taskId: string, workerId: string): WorkboardTask | undefined {
  const task = findTaskById(taskId);
  if (!task) return undefined;
  if (task.status !== 'in_progress') return task;
  if (task.assignedTo !== workerId) return undefined;

  const now = nowIso();
  db()
    .prepare(
      `UPDATE workboard_tasks 
       SET status = 'pending', assigned_to = NULL, claimed_at = NULL, started_at = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(now, taskId);

  const worker = findWorkerById(workerId);
  if (worker && worker.currentTaskId === taskId) {
    updateWorker(workerId, { status: 'idle', currentTaskId: undefined });
  }

  return findTaskById(taskId);
}

export function failTask(taskId: string, error: string): WorkboardTask | undefined {
  const task = findTaskById(taskId);
  if (!task) return undefined;
  if (task.status === 'done' || task.status === 'cancelled') return task;

  const now = nowIso();
  db()
    .prepare(
      `UPDATE workboard_tasks 
       SET status = 'blocked', error = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(error, now, now, taskId);

  if (task.assignedTo) {
    const worker = findWorkerById(task.assignedTo);
    if (worker && worker.currentTaskId === taskId) {
      updateWorker(task.assignedTo, { status: 'idle', currentTaskId: undefined });
    }
  }

  return findTaskById(taskId);
}

export function getAvailableTasks(workerType?: WorkerType): WorkboardTask[] {
  let query = `SELECT t.* FROM workboard_tasks t 
               WHERE t.status = 'pending' 
                 AND (t.assigned_to IS NULL OR t.assigned_to = '')`;
  
  const params: unknown[] = [];

  if (workerType) {
    query += ` AND (
      SELECT w.type FROM workboard_workers w 
      WHERE w.id = t.assigned_to
    ) = ?`;
    params.push(workerType);
  }

  query += ` ORDER BY 
    CASE t.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      WHEN 'low' THEN 4 
    END ASC,
    t.created_at ASC`;

  const rows = db().prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskRow);
}

export function getWorkerTasks(workerId: string, status?: TaskStatus): WorkboardTask[] {
  let query = 'SELECT * FROM workboard_tasks WHERE assigned_to = ?';
  const params: unknown[] = [workerId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY updated_at DESC';

  const rows = db().prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskRow);
}

export function getBlockingTasks(taskId: string): WorkboardTask[] {
  const task = findTaskById(taskId);
  if (!task || task.dependsOn.length === 0) return [];
  
  const placeholders = task.dependsOn.map(() => '?').join(', ');
  const rows = db()
    .prepare(`SELECT * FROM workboard_tasks WHERE id IN (${placeholders})`)
    .all(...task.dependsOn) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskRow);
}

export function getBlockedByTasks(taskId: string): WorkboardTask[] {
  const rows = db()
    .prepare('SELECT * FROM workboard_tasks WHERE depends_on IS NOT NULL')
    .all() as Array<Record<string, unknown>>;
  return rows
    .map(normalizeTaskRow)
    .filter(t => t.dependsOn.includes(taskId));
}

// ===================== Workers =====================

export function findAllWorkers(): WorkboardWorker[] {
  const rows = db()
    .prepare('SELECT * FROM workboard_workers ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(normalizeWorkerRow);
}

export function findWorkerById(id: string): WorkboardWorker | undefined {
  const row = db().prepare('SELECT * FROM workboard_workers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeWorkerRow(row) : undefined;
}

export function findWorkersByType(type: WorkerType): WorkboardWorker[] {
  const rows = db()
    .prepare('SELECT * FROM workboard_workers WHERE type = ? ORDER BY created_at DESC')
    .all(type) as Array<Record<string, unknown>>;
  return rows.map(normalizeWorkerRow);
}

export function findWorkersByStatus(status: WorkerStatus): WorkboardWorker[] {
  const rows = db()
    .prepare('SELECT * FROM workboard_workers WHERE status = ? ORDER BY last_heartbeat DESC')
    .all(status) as Array<Record<string, unknown>>;
  return rows.map(normalizeWorkerRow);
}

export function createWorker(data: {
  name: string;
  type?: WorkerType;
  status?: WorkerStatus;
}): WorkboardWorker {
  const id = uuidv4();
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO workboard_workers (id, name, type, status, current_task_id, last_heartbeat, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.name,
      data.type || 'agent',
      data.status || 'idle',
      null,
      null,
      now
    );
  return findWorkerById(id)!;
}

export function updateWorker(
  id: string,
  data: Partial<{
    name: string;
    type: WorkerType;
    status: WorkerStatus;
    currentTaskId: string;
  }>
): WorkboardWorker | undefined {
  const existing = findWorkerById(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const vals: unknown[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    vals.push(data.name);
  }
  if (data.type !== undefined) {
    fields.push('type = ?');
    vals.push(data.type);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    vals.push(data.status);
  }
  if (data.currentTaskId !== undefined) {
    fields.push('current_task_id = ?');
    vals.push(data.currentTaskId || null);
  }

  if (fields.length === 0) return existing;

  vals.push(id);

  db().prepare(`UPDATE workboard_workers SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return findWorkerById(id);
}

export function deleteWorker(id: string): boolean {
  const result = db().prepare('DELETE FROM workboard_workers WHERE id = ?').run(id);
  return result.changes > 0;
}

export function workerHeartbeat(workerId: string): WorkboardWorker | undefined {
  const worker = findWorkerById(workerId);
  if (!worker) return undefined;

  const now = nowIso();
  db()
    .prepare('UPDATE workboard_workers SET last_heartbeat = ? WHERE id = ?')
    .run(now, workerId);

  return findWorkerById(workerId);
}
