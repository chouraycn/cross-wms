/**
 * Tasks DAO — 封装 tasks 表的全部数据库操作
 * 对应表：tasks（含 project_id 外键 → projects.id）
 */

import { initDb } from '../db.js';
import type { Task, TaskFormData } from '@src/types/task';

function db() {
  return initDb();
}

/** 查询全部任务（可选按 projectId 过滤） */
export function findAllTasks(projectId?: string): Task[] {
  let sql = 'SELECT * FROM tasks';
  const params: string[] = [];
  if (projectId) {
    sql += ' WHERE project_id = ?';
    params.push(projectId);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db().prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(normalizeRow);
}

/** 按 id 查询单条任务 */
export function findTaskById(id: string): Task | undefined {
  const row = db().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? normalizeRow(row) : undefined;
}

/** 新建任务 */
export function createTask(data: {
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  tags: string[];
  dueDate: string;
  projectId: string;
}): Task {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO tasks (id, title, description, status, priority, assignee, tags, due_date, project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.description,
    data.status,
    data.priority,
    data.assignee,
    JSON.stringify(data.tags),
    data.dueDate,
    data.projectId,
    now,
    now,
  );
  return findTaskById(id)!;
}

/** 更新任务（支持部分字段） */
export function updateTask(id: string, data: Partial<{
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  tags: string[];
  dueDate: string;
}>): Task | undefined {
  const existing = findTaskById(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const vals: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); vals.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); vals.push(data.description); }
  if (data.status !== undefined) { fields.push('status = ?'); vals.push(data.status); }
  if (data.priority !== undefined) { fields.push('priority = ?'); vals.push(data.priority); }
  if (data.assignee !== undefined) { fields.push('assignee = ?'); vals.push(data.assignee); }
  if (data.tags !== undefined) { fields.push('tags = ?'); vals.push(JSON.stringify(data.tags)); }
  if (data.dueDate !== undefined) { fields.push('due_date = ?'); vals.push(data.dueDate); }

  if (fields.length === 0) return existing;

  fields.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(id);

  db().prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return findTaskById(id);
}

/** 删除任务 */
export function deleteTask(id: string): boolean {
  const result = db().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 从 localStorage 迁移任务数据到数据库 */
export function migrateTasks(tasks: Array<{
  id: string;
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  tags: string[];
  dueDate: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}>): { imported: number; skipped: number } {
  const insert = db().prepare(`
    INSERT OR IGNORE INTO tasks (id, title, description, status, priority, assignee, tags, due_date, project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  let skipped = 0;
  for (const t of tasks) {
    const result = insert.run(
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assignee,
      JSON.stringify(t.tags),
      t.dueDate,
      t.projectId,
      t.createdAt,
      t.updatedAt,
    );
    if (result.changes > 0) imported++; else skipped++;
  }
  return { imported, skipped };
}

/** 将数据库行转为 Task 类型（tags JSON → string[]） */
function normalizeRow(row: Record<string, unknown>): Task {
  let tags: string[] = [];
  try { tags = JSON.parse((row.tags as string) || '[]'); } catch {}
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    assignee: row.assignee as string,
    tags,
    dueDate: row.due_date as string,
    projectId: row.project_id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
