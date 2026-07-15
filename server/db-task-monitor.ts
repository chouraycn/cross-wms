import type Database from 'better-sqlite3';
import { logger } from './logger.js';

export interface TodoItemRow {
  id: string;
  session_id: string;
  text: string;
  status: string;
  source: string;
  priority: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ArtifactRow {
  id: string;
  session_id: string;
  message_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  description: string | null;
  created_at: string;
}

export interface ToolCallRow {
  id: string;
  session_id: string;
  message_id: string;
  tool_name: string;
  tool_type: string;
  status: string;
  arguments_json: string | null;
  result_json: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface TrajectoryEventRow {
  id: string;
  trace_id: string;
  schema_version: number;
  source: string;
  type: string;
  ts: string;
  seq: number;
  session_id: string;
  run_id: string | null;
  entry_id: string | null;
  parent_entry_id: string | null;
  data_json: string | null;
  provider: string | null;
  model_id: string | null;
  workspace_dir: string | null;
}

export function initTaskMonitorTables(db: Database.Database): void {
  const start = Date.now();

  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      priority TEXT NOT NULL DEFAULT 'normal',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_todo_items_session ON todo_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_todo_items_status ON todo_items(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_message ON artifacts(message_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      tool_type TEXT NOT NULL DEFAULT 'mcp',
      status TEXT NOT NULL DEFAULT 'running',
      arguments_json TEXT,
      result_json TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_events (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'runtime',
      type TEXT NOT NULL,
      ts TEXT NOT NULL,
      seq INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      run_id TEXT,
      entry_id TEXT,
      parent_entry_id TEXT,
      data_json TEXT,
      provider TEXT,
      model_id TEXT,
      workspace_dir TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trajectory_trace ON trajectory_events(trace_id);
    CREATE INDEX IF NOT EXISTS idx_trajectory_session ON trajectory_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_trajectory_type ON trajectory_events(type);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_flows (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      sync_mode INTEGER NOT NULL DEFAULT 1,
      current_step_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      total_steps INTEGER NOT NULL DEFAULT 0,
      completed_steps INTEGER NOT NULL DEFAULT 0,
      failed_steps INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_task_flows_session ON task_flows(session_id);
    CREATE INDEX IF NOT EXISTS idx_task_flows_status ON task_flows(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_flow_steps (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      task_name TEXT NOT NULL,
      task_description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      arguments_json TEXT,
      result_json TEXT,
      error_message TEXT,
      depends_on TEXT,
      next_step_ids TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_task_flow_steps_flow ON task_flow_steps(flow_id);
    CREATE INDEX IF NOT EXISTS idx_task_flow_steps_status ON task_flow_steps(status);
  `);

  logger.info(`[DB] TaskMonitor tables initialized in ${Date.now() - start}ms`);
}
