import Database from 'better-sqlite3';
import { logger } from './logger.js';

// ===================== Project & Task Types =====================

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  category: string;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string;
  due_date: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

// ===================== Skill Chain Types =====================

export interface SkillChainNodeRow {
  id: string;
  chain_id: string;
  skill_id: string;
  skill_name: string;
  skill_icon: string;
  data_pass_mode: string;
  selected_fields: string;
  custom_mapping: string;
  timeout: number;
  retry_count: number;
  node_order: number;
}

export interface SkillChainRow {
  id: string;
  name: string;
  description: string;
  fail_strategy: string;
  skill_ids: string;
  created_at: string;
  updated_at: string;
}

export interface SkillChainExecutionRow {
  id: string;
  chain_id: string;
  status: string;
  fail_strategy: string;
  steps: string;
  node_results: string;
  result: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
}

export interface SkillAuditRow {
  [key: string]: unknown;
  id: string;
  skill_id: string;
  skill_version: string;
  score: number;
  level: string;
  report_json: string;
  report_markdown: string;
  triggered_by: string;
  created_at: string;
}

// ===================== Table Initialization & Migrations =====================

export function initProjectTables(db: Database.Database): void {
  // Projects and Tasks tables (v2.1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','completed')),
      category TEXT DEFAULT 'custom' CHECK(category IN ('custom','template','fixed')),
      agent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      assignee TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      due_date TEXT DEFAULT '',
      project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  `);

  // Add agent_id column to projects table (idempotent migration)
  try {
    const projectAgentIdExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('projects') WHERE name='agent_id'`).get() as { cnt: number };
    if (projectAgentIdExists.cnt === 0) {
      db.exec(`ALTER TABLE projects ADD COLUMN agent_id TEXT`);
      logger.info('[Migrate] 添加 agent_id 列到 projects 表');
    }
  } catch (e) {
    logger.warn('[Migrate] 添加 projects.agent_id 列失败:', e);
  }
}
