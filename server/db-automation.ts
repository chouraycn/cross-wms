import type Database from 'better-sqlite3';
import { logger } from './logger.js';

// ===================== Automation Types =====================

export interface AutomationRow {
  id: string;
  name: string;
  description: string;
  status: string;
  schedule_type: string;
  rrule: string;
  scheduled_at: string | null;
  schedule_label: string;
  prompt: string;
  task_type: string;
  task_config: string; // JSON string
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  trigger_type: string;
  event_trigger: string | null; // JSON string
  webhook_config: string | null; // JSON string (encrypted secret)
  execution_policy: string | null; // JSON string
  notification_config: string | null; // JSON string
}

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  task_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  result: string | null;
  steps: string; // JSON string
  is_retry: number;
  trigger_source: string;
  trigger_detail: string | null; // JSON string
  retry_count: number;
}

export function initAutomationTables(db: Database.Database): void {
  logger.info('[DB] 初始化 Automation 表');

  db.exec(`
    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      schedule_type TEXT NOT NULL DEFAULT 'recurring',
      rrule TEXT DEFAULT '',
      scheduled_at TEXT DEFAULT NULL,
      schedule_label TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      task_type TEXT NOT NULL DEFAULT 'custom',
      task_config TEXT DEFAULT '{}',
      valid_from TEXT DEFAULT NULL,
      valid_until TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_at TEXT DEFAULT NULL,
      next_run_at TEXT DEFAULT NULL,
      run_count INTEGER NOT NULL DEFAULT 0,
      trigger_type TEXT NOT NULL DEFAULT 'schedule',
      event_trigger TEXT DEFAULT NULL,
      webhook_config TEXT DEFAULT NULL,
      execution_policy TEXT DEFAULT NULL,
      notification_config TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      completed_at TEXT DEFAULT NULL,
      duration INTEGER DEFAULT NULL,
      result TEXT DEFAULT NULL,
      steps TEXT DEFAULT '[]',
      is_retry INTEGER NOT NULL DEFAULT 0,
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      trigger_detail TEXT DEFAULT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (automation_id) REFERENCES automations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);
    CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON automations(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(started_at);
  `);
}
