import type Database from 'better-sqlite3';
import { logger } from './logger.js';

export interface WorkboardTaskRow {
  id: string;
  session_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  order_index: number;
  parent_task_id: string | null;
  assigned_to: string | null;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: string | null;
  error: string | null;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkboardWorkerRow {
  id: string;
  name: string;
  type: string;
  status: string;
  current_task_id: string | null;
  last_heartbeat: string | null;
  created_at: string;
}

export function initWorkboardTables(db: Database.Database): void {
  const start = Date.now();

  db.exec(`
    CREATE TABLE IF NOT EXISTS workboard_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      order_index INTEGER NOT NULL DEFAULT 0,
      parent_task_id TEXT,
      assigned_to TEXT,
      claimed_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      result TEXT,
      error TEXT,
      depends_on TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workboard_tasks_session ON workboard_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_workboard_tasks_status ON workboard_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_workboard_tasks_parent ON workboard_tasks(parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_workboard_tasks_assigned ON workboard_tasks(assigned_to);
  `);

  try {
    db.pragma('table_info(workboard_tasks)');
    const hasResult = db.prepare("SELECT name FROM pragma_table_info('workboard_tasks') WHERE name = 'result'").get();
    if (!hasResult) {
      db.exec('ALTER TABLE workboard_tasks ADD COLUMN result TEXT');
      logger.info('[DB] Added result column to workboard_tasks');
    }
    const hasError = db.prepare("SELECT name FROM pragma_table_info('workboard_tasks') WHERE name = 'error'").get();
    if (!hasError) {
      db.exec('ALTER TABLE workboard_tasks ADD COLUMN error TEXT');
      logger.info('[DB] Added error column to workboard_tasks');
    }
  } catch {
    // 列可能已存在，忽略错误
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS workboard_workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'agent',
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workboard_workers_status ON workboard_workers(status);
    CREATE INDEX IF NOT EXISTS idx_workboard_workers_type ON workboard_workers(type);
  `);

  logger.info(`[DB] Workboard tables initialized in ${Date.now() - start}ms`);
}
