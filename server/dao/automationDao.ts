/**
 * Automation DAO — 自动化任务与执行记录的数据访问层
 *
 * 所有 JSON 字段在存取时自动序列化/反序列化，对调用者透明。
 * 时间戳统一使用 ISO 8601 字符串。
 */

import { initDb } from '../db.js';
import type Database from 'better-sqlite3';

// 复用 db.ts 中导出的 row 类型
import type { AutomationRow, AutomationRunRow } from '../db.js';

// 前端类型（为保持自包含，这里直接定义，实际调用方可使用 src/services/automation 中的类型）
export interface AutomationData {
  id: string;
  name: string;
  description: string;
  status: string;
  scheduleType: string;
  rrule: string;
  scheduledAt: string | null;
  scheduleLabel: string;
  prompt: string;
  taskType: string;
  taskConfig: Record<string, unknown>;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  triggerType: string;
  eventTrigger: Record<string, unknown> | null;
  webhookConfig: Record<string, unknown> | null;
  executionPolicy: Record<string, unknown> | null;
  notificationConfig: Record<string, unknown> | null;
}

export interface AutomationExecutionData {
  id: string;
  automationId: string;
  taskType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  result: string | null;
  steps: unknown[];
  isRetry: boolean;
  triggerSource: string;
  triggerDetail: unknown | null;
  retryCount: number;
}

// ===================== JSON Field Helpers =====================

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

// ===================== Row ↔ Data Mappers =====================

function rowToAutomation(row: AutomationRow): AutomationData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    scheduleType: row.schedule_type,
    rrule: row.rrule,
    scheduledAt: row.scheduled_at,
    scheduleLabel: row.schedule_label,
    prompt: row.prompt,
    taskType: row.task_type,
    taskConfig: parseJson(row.task_config) ?? {},
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    runCount: row.run_count,
    triggerType: row.trigger_type,
    eventTrigger: parseJson(row.event_trigger),
    webhookConfig: parseJson(row.webhook_config),
    executionPolicy: parseJson(row.execution_policy),
    notificationConfig: parseJson(row.notification_config),
  };
}

function rowToExecution(row: AutomationRunRow): AutomationExecutionData {
  return {
    id: row.id,
    automationId: row.automation_id,
    taskType: row.task_type,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    duration: row.duration,
    result: row.result,
    steps: parseJsonArray(row.steps),
    isRetry: row.is_retry === 1,
    triggerSource: row.trigger_source,
    triggerDetail: parseJson(row.trigger_detail),
    retryCount: row.retry_count,
  };
}

// ===================== Automation CRUD =====================

function db(): Database.Database {
  return initDb();
}

export function getAllAutomations(): AutomationData[] {
  const rows = db().prepare('SELECT * FROM automations ORDER BY created_at DESC').all() as AutomationRow[];
  return rows.map(rowToAutomation);
}

export function getAutomationById(id: string): AutomationData | null {
  const row = db().prepare('SELECT * FROM automations WHERE id = ?').get(id) as AutomationRow | undefined;
  return row ? rowToAutomation(row) : null;
}

export function createAutomation(data: Omit<AutomationData, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'runCount'>): AutomationData {
  const id = 'auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();

  const row: AutomationRow = {
    id,
    name: data.name,
    description: data.description ?? '',
    status: data.status ?? 'ACTIVE',
    schedule_type: data.scheduleType ?? 'recurring',
    rrule: data.rrule ?? '',
    scheduled_at: data.scheduledAt ?? null,
    schedule_label: data.scheduleLabel ?? '',
    prompt: data.prompt ?? '',
    task_type: data.taskType ?? 'custom',
    task_config: serializeJson(data.taskConfig ?? {}),
    valid_from: data.validFrom ?? null,
    valid_until: data.validUntil ?? null,
    created_at: now,
    updated_at: now,
    last_run_at: null,
    next_run_at: null,
    run_count: 0,
    trigger_type: data.triggerType ?? 'schedule',
    event_trigger: data.eventTrigger ? serializeJson(data.eventTrigger) : null,
    webhook_config: data.webhookConfig ? serializeJson(data.webhookConfig) : null,
    execution_policy: data.executionPolicy ? serializeJson(data.executionPolicy) : null,
    notification_config: data.notificationConfig ? serializeJson(data.notificationConfig) : null,
  };

  db().prepare(`
    INSERT INTO automations (
      id, name, description, status, schedule_type, rrule, scheduled_at, schedule_label,
      prompt, task_type, task_config, valid_from, valid_until, created_at, updated_at,
      last_run_at, next_run_at, run_count, trigger_type, event_trigger, webhook_config,
      execution_policy, notification_config
    ) VALUES (
      @id, @name, @description, @status, @schedule_type, @rrule, @scheduled_at, @schedule_label,
      @prompt, @task_type, @task_config, @valid_from, @valid_until, @created_at, @updated_at,
      @last_run_at, @next_run_at, @run_count, @trigger_type, @event_trigger, @webhook_config,
      @execution_policy, @notification_config
    )
  `).run(row);

  return rowToAutomation(row);
}

export function updateAutomation(id: string, data: Partial<AutomationData>): AutomationData | null {
  const existing = db().prepare('SELECT * FROM automations WHERE id = ?').get(id) as AutomationRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();

  // Build SET clause dynamically from provided fields
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  const fieldMap: Array<{
    dataKey: keyof AutomationData;
    dbKey: keyof AutomationRow;
    isJson: boolean;
  }> = [
    { dataKey: 'name', dbKey: 'name', isJson: false },
    { dataKey: 'description', dbKey: 'description', isJson: false },
    { dataKey: 'status', dbKey: 'status', isJson: false },
    { dataKey: 'scheduleType', dbKey: 'schedule_type', isJson: false },
    { dataKey: 'rrule', dbKey: 'rrule', isJson: false },
    { dataKey: 'scheduledAt', dbKey: 'scheduled_at', isJson: false },
    { dataKey: 'scheduleLabel', dbKey: 'schedule_label', isJson: false },
    { dataKey: 'prompt', dbKey: 'prompt', isJson: false },
    { dataKey: 'taskType', dbKey: 'task_type', isJson: false },
    { dataKey: 'taskConfig', dbKey: 'task_config', isJson: true },
    { dataKey: 'validFrom', dbKey: 'valid_from', isJson: false },
    { dataKey: 'validUntil', dbKey: 'valid_until', isJson: false },
    { dataKey: 'lastRunAt', dbKey: 'last_run_at', isJson: false },
    { dataKey: 'nextRunAt', dbKey: 'next_run_at', isJson: false },
    { dataKey: 'runCount', dbKey: 'run_count', isJson: false },
    { dataKey: 'triggerType', dbKey: 'trigger_type', isJson: false },
    { dataKey: 'eventTrigger', dbKey: 'event_trigger', isJson: true },
    { dataKey: 'webhookConfig', dbKey: 'webhook_config', isJson: true },
    { dataKey: 'executionPolicy', dbKey: 'execution_policy', isJson: true },
    { dataKey: 'notificationConfig', dbKey: 'notification_config', isJson: true },
  ];

  for (const { dataKey, dbKey, isJson } of fieldMap) {
    if (dataKey in data && data[dataKey] !== undefined) {
      const paramName = `p_${dbKey}`;
      setClauses.push(`${dbKey} = @${paramName}`);
      if (isJson) {
        params[paramName] = serializeJson(data[dataKey]);
      } else {
        params[paramName] = data[dataKey];
      }
    }
  }

  // Always update updated_at
  setClauses.push('updated_at = @updated_at');
  params['updated_at'] = now;

  if (setClauses.length === 1) {
    // Only updated_at changed, nothing else
    return rowToAutomation(existing);
  }

  db().prepare(`UPDATE automations SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

  const updated = getAutomationById(id);
  return updated;
}

export function deleteAutomation(id: string): boolean {
  const result = db().prepare('DELETE FROM automations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getActiveAutomationsByTriggerType(triggerType: string): AutomationData[] {
  const rows = db().prepare(
    'SELECT * FROM automations WHERE status = ? AND trigger_type = ? ORDER BY created_at DESC'
  ).all('ACTIVE', triggerType) as AutomationRow[];
  return rows.map(rowToAutomation);
}

export function findAutomationsByEvent(eventName: string): AutomationData[] {
  // 匹配 event_trigger JSON 中 eventName 字段
  const rows = db().prepare(
    `SELECT * FROM automations 
     WHERE status = 'ACTIVE' 
       AND trigger_type = 'event' 
       AND event_trigger IS NOT NULL
       AND json_extract(event_trigger, '$.eventName') = ? 
     ORDER BY created_at DESC`
  ).all(eventName) as AutomationRow[];
  return rows.map(rowToAutomation);
}

// ===================== Automation Run CRUD =====================

export function createRun(data: Omit<AutomationExecutionData, 'id'>): AutomationExecutionData {
  const id = 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  const row: AutomationRunRow = {
    id,
    automation_id: data.automationId,
    task_type: data.taskType,
    status: data.status ?? 'running',
    started_at: data.startedAt ?? new Date().toISOString(),
    completed_at: data.completedAt ?? null,
    duration: data.duration ?? null,
    result: data.result ?? null,
    steps: serializeJson(data.steps ?? []),
    is_retry: data.isRetry ? 1 : 0,
    trigger_source: data.triggerSource ?? 'manual',
    trigger_detail: data.triggerDetail ? serializeJson(data.triggerDetail) : null,
    retry_count: data.retryCount ?? 0,
  };

  db().prepare(`
    INSERT INTO automation_runs (
      id, automation_id, task_type, status, started_at, completed_at,
      duration, result, steps, is_retry, trigger_source, trigger_detail, retry_count
    ) VALUES (
      @id, @automation_id, @task_type, @status, @started_at, @completed_at,
      @duration, @result, @steps, @is_retry, @trigger_source, @trigger_detail, @retry_count
    )
  `).run(row);

  return rowToExecution(row);
}

export function updateRun(id: string, data: Partial<AutomationExecutionData>): AutomationExecutionData | null {
  const existing = db().prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as AutomationRunRow | undefined;
  if (!existing) return null;

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  const fieldMap: Array<{
    dataKey: keyof AutomationExecutionData;
    dbKey: keyof AutomationRunRow;
    isJson: boolean;
  }> = [
    { dataKey: 'taskType', dbKey: 'task_type', isJson: false },
    { dataKey: 'status', dbKey: 'status', isJson: false },
    { dataKey: 'startedAt', dbKey: 'started_at', isJson: false },
    { dataKey: 'completedAt', dbKey: 'completed_at', isJson: false },
    { dataKey: 'duration', dbKey: 'duration', isJson: false },
    { dataKey: 'result', dbKey: 'result', isJson: false },
    { dataKey: 'steps', dbKey: 'steps', isJson: true },
    { dataKey: 'isRetry', dbKey: 'is_retry', isJson: false },
    { dataKey: 'triggerSource', dbKey: 'trigger_source', isJson: false },
    { dataKey: 'triggerDetail', dbKey: 'trigger_detail', isJson: true },
    { dataKey: 'retryCount', dbKey: 'retry_count', isJson: false },
  ];

  for (const { dataKey, dbKey, isJson } of fieldMap) {
    if (dataKey in data && data[dataKey] !== undefined) {
      const paramName = `p_${dbKey}`;
      setClauses.push(`${dbKey} = @${paramName}`);
      if (isJson) {
        params[paramName] = serializeJson(data[dataKey]);
      } else if (dataKey === 'isRetry') {
        params[paramName] = data[dataKey] ? 1 : 0;
      } else {
        params[paramName] = data[dataKey];
      }
    }
  }

  if (setClauses.length === 0) return rowToExecution(existing);

  db().prepare(`UPDATE automation_runs SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

  const updated = db().prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as AutomationRunRow;
  return rowToExecution(updated);
}

export function getRunsByAutomationId(
  automationId: string,
  limit?: number,
  offset?: number,
): { data: AutomationExecutionData[]; total: number } {
  const countRow = db().prepare(
    'SELECT COUNT(*) as total FROM automation_runs WHERE automation_id = ?'
  ).get(automationId) as { total: number };

  let query = 'SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC';
  const params: unknown[] = [automationId];

  if (limit !== undefined && limit > 0) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  if (offset !== undefined && offset > 0) {
    query += ' OFFSET ?';
    params.push(offset);
  }

  const rows = db().prepare(query).all(...params) as AutomationRunRow[];
  return {
    data: rows.map(rowToExecution),
    total: countRow.total,
  };
}

/** 获取所有执行记录（全局，不分 automation） */
export function getAllRuns(
  limit?: number,
  offset?: number,
): { data: AutomationExecutionData[]; total: number } {
  const countRow = db().prepare(
    'SELECT COUNT(*) as total FROM automation_runs'
  ).get() as { total: number };

  let query = 'SELECT * FROM automation_runs ORDER BY started_at DESC';
  const params: unknown[] = [];

  if (limit !== undefined && limit > 0) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  if (offset !== undefined && offset > 0) {
    query += ' OFFSET ?';
    params.push(offset);
  }

  const rows = db().prepare(query).all(...params) as AutomationRunRow[];
  return {
    data: rows.map(rowToExecution),
    total: countRow.total,
  };
}

/** 按 automation_id 删除执行记录 */
export function deleteRunsByAutomationId(automationId: string): number {
  const result = db().prepare('DELETE FROM automation_runs WHERE automation_id = ?').run(automationId);
  return result.changes;
}

/** 清空所有执行记录 */
export function clearAllExecutions(): number {
  const result = db().prepare('DELETE FROM automation_runs').run();
  return result.changes;
}
