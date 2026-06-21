/**
 * Project DAO — 项目数据访问层
 *
 * 所有 JSON 字段在存取时自动序列化/反序列化，对调用者透明。
 * 时间戳统一使用 ISO 8601 字符串。
 */

import { initDb } from '../db.js';
import type { ProjectRow } from '../db.js';
import type Database from 'better-sqlite3';

// ===================== JSON Field Helpers =====================

// Projects table doesn't have JSON fields, but keeping structure for consistency

// ===================== Row ↔ Data Mappers =====================

function rowToProject(row: ProjectRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    category: row.category,
    agentId: row.agent_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===================== Project CRUD =====================

function db(): Database.Database {
  return initDb();
}

export function getAllProjects(): Record<string, unknown>[] {
  const rows = db().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProjectById(id: string): Record<string, unknown> | null {
  const row = db().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function createProject(data: {
  id?: string;
  name: string;
  description?: string;
  status?: string;
  category?: string;
  agent_id?: string | null;
}): Record<string, unknown> {
  const id = data.id || `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  db().prepare(`
    INSERT INTO projects (id, name, description, status, category, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || '',
    data.status || 'active',
    data.category || 'custom',
    data.agent_id ?? null,
    now,
    now
  );

  return getProjectById(id)!;
}

export function updateProject(id: string, data: {
  name?: string;
  description?: string;
  status?: string;
  category?: string;
  agent_id?: string | null;
}): Record<string, unknown> | null {
  const existing = db().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    setClauses.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push('description = ?');
    params.push(data.description);
  }
  if (data.status !== undefined) {
    setClauses.push('status = ?');
    params.push(data.status);
  }
  if (data.category !== undefined) {
    setClauses.push('category = ?');
    params.push(data.category);
  }
  if (data.agent_id !== undefined) {
    setClauses.push('agent_id = ?');
    params.push(data.agent_id);
  }

  setClauses.push('updated_at = ?');
  params.push(now);

  params.push(id);

  db().prepare(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getProjectById(id);
}

export function deleteProject(id: string): boolean {
  const result = db().prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getProjectTasks(projectId: string): Record<string, unknown>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = db().prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[];
  return rows.map(rowToTask);
}

// Helper to convert task row to frontend format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTask(row: any): Record<string, unknown> {
  let tags: string[] = [];
  try {
    if (row.tags) tags = JSON.parse(row.tags);
  } catch { /* ignore */ }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    tags,
    due_date: row.due_date,
    project_id: row.project_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
