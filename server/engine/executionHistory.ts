/**
 * 执行历史存储 — 工作流、触发器、手动执行的统一记录
 *
 * 支持分页查询、状态/类型/时间过滤、节点执行详情
 */

import { initDb } from '../db.js';
import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

// ===================== Types =====================

export interface ExecutionNode {
  nodeId: string;
  nodeName: string;
  status: 'success' | 'failed' | 'skipped';
  startTime: number;
  endTime: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface ExecutionRecord {
  id: string;
  workflowId?: string;
  triggerId?: string;
  type: 'workflow' | 'trigger' | 'manual';
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  nodes?: ExecutionNode[];
  error?: string;
  output?: Record<string, unknown>;
}

export interface ExecutionRecordRow {
  id: string;
  workflow_id: string | null;
  trigger_id: string | null;
  type: string;
  status: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
  nodes: string | null; // JSON
  error: string | null;
  output: string | null; // JSON
  created_at: string;
}

export interface ExecutionHistoryFilter {
  status?: 'running' | 'success' | 'failed' | 'cancelled';
  type?: 'workflow' | 'trigger' | 'manual';
  startTimeFrom?: number;
  startTimeTo?: number;
  workflowId?: string;
  triggerId?: string;
}

export interface ExecutionHistoryStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  avgDuration: number;
  successRate: number;
}

// ===================== JSON Helpers =====================

function serializeJson(value: unknown): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
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

function parseNodes(value: string | null): ExecutionNode[] | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ExecutionNode[];
  } catch {
    return null;
  }
}

// ===================== Row ↔ Data Mapper =====================

function rowToExecutionRecord(row: ExecutionRecordRow): ExecutionRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id ?? undefined,
    triggerId: row.trigger_id ?? undefined,
    type: row.type as ExecutionRecord['type'],
    status: row.status as ExecutionRecord['status'],
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    duration: row.duration ?? undefined,
    nodes: parseNodes(row.nodes) ?? undefined,
    error: row.error ?? undefined,
    output: parseJson(row.output) ?? undefined,
  };
}

// ===================== DB Helper =====================

function db(): Database.Database {
  return initDb();
}

// ===================== Table Initialization =====================

let tablesInitialized = false;

export function initExecutionHistoryTables(): void {
  if (tablesInitialized) return;

  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS execution_history (
      id TEXT PRIMARY KEY,
      workflow_id TEXT,
      trigger_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      duration INTEGER,
      nodes TEXT,
      error TEXT,
      output TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_execution_history_status ON execution_history(status);
    CREATE INDEX IF NOT EXISTS idx_execution_history_type ON execution_history(type);
    CREATE INDEX IF NOT EXISTS idx_execution_history_start_time ON execution_history(start_time);
    CREATE INDEX IF NOT EXISTS idx_execution_history_workflow_id ON execution_history(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_execution_history_trigger_id ON execution_history(trigger_id);
  `);

  tablesInitialized = true;
  logger.info('[ExecutionHistory] 表初始化完成');
}

// ===================== CRUD Operations =====================

/**
 * 创建执行记录
 */
export function createExecutionRecord(data: Omit<ExecutionRecord, 'id'>): ExecutionRecord {
  initExecutionHistoryTables();

  const id = 'exec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();

  const row: ExecutionRecordRow = {
    id,
    workflow_id: data.workflowId ?? null,
    trigger_id: data.triggerId ?? null,
    type: data.type,
    status: data.status,
    start_time: data.startTime,
    end_time: data.endTime ?? null,
    duration: data.duration ?? null,
    nodes: serializeJson(data.nodes),
    error: data.error ?? null,
    output: serializeJson(data.output),
    created_at: now,
  };

  db().prepare(`
    INSERT INTO execution_history (
      id, workflow_id, trigger_id, type, status, start_time, end_time, duration, nodes, error, output, created_at
    ) VALUES (
      @id, @workflow_id, @trigger_id, @type, @status, @start_time, @end_time, @duration, @nodes, @error, @output, @created_at
    )
  `).run(row);

  return rowToExecutionRecord(row);
}

/**
 * 更新执行记录
 */
export function updateExecutionRecord(
  id: string,
  data: Partial<Pick<ExecutionRecord, 'status' | 'endTime' | 'duration' | 'nodes' | 'error' | 'output'>>,
): ExecutionRecord | null {
  initExecutionHistoryTables();

  const existing = db().prepare('SELECT * FROM execution_history WHERE id = ?').get(id) as ExecutionRecordRow | undefined;
  if (!existing) return null;

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (data.status !== undefined) {
    setClauses.push('status = @status');
    params.status = data.status;
  }
  if (data.endTime !== undefined) {
    setClauses.push('end_time = @end_time');
    params.end_time = data.endTime;
  }
  if (data.duration !== undefined) {
    setClauses.push('duration = @duration');
    params.duration = data.duration;
  }
  if (data.nodes !== undefined) {
    setClauses.push('nodes = @nodes');
    params.nodes = serializeJson(data.nodes);
  }
  if (data.error !== undefined) {
    setClauses.push('error = @error');
    params.error = data.error;
  }
  if (data.output !== undefined) {
    setClauses.push('output = @output');
    params.output = serializeJson(data.output);
  }

  if (setClauses.length === 0) return rowToExecutionRecord(existing);

  db().prepare(`UPDATE execution_history SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

  const updated = db().prepare('SELECT * FROM execution_history WHERE id = ?').get(id) as ExecutionRecordRow;
  return rowToExecutionRecord(updated);
}

/**
 * 获取单条执行记录
 */
export function getExecutionRecordById(id: string): ExecutionRecord | null {
  initExecutionHistoryTables();

  const row = db().prepare('SELECT * FROM execution_history WHERE id = ?').get(id) as ExecutionRecordRow | undefined;
  return row ? rowToExecutionRecord(row) : null;
}

/**
 * 分页查询执行历史
 */
export function getExecutionHistory(
  limit: number = 50,
  offset: number = 0,
  filter?: ExecutionHistoryFilter,
): { data: ExecutionRecord[]; total: number } {
  initExecutionHistoryTables();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter?.type) {
    conditions.push('type = ?');
    params.push(filter.type);
  }
  if (filter?.startTimeFrom !== undefined) {
    conditions.push('start_time >= ?');
    params.push(filter.startTimeFrom);
  }
  if (filter?.startTimeTo !== undefined) {
    conditions.push('start_time <= ?');
    params.push(filter.startTimeTo);
  }
  if (filter?.workflowId) {
    conditions.push('workflow_id = ?');
    params.push(filter.workflowId);
  }
  if (filter?.triggerId) {
    conditions.push('trigger_id = ?');
    params.push(filter.triggerId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 获取总数
  const countRow = db().prepare(`SELECT COUNT(*) as total FROM execution_history ${whereClause}`).get(...params) as { total: number };

  // 获取数据
  const query = `SELECT * FROM execution_history ${whereClause} ORDER BY start_time DESC LIMIT ? OFFSET ?`;
  const rows = db().prepare(query).all(...params, limit, offset) as ExecutionRecordRow[];

  return {
    data: rows.map(rowToExecutionRecord),
    total: countRow.total,
  };
}

/**
 * 删除单条执行记录
 */
export function deleteExecutionRecord(id: string): boolean {
  initExecutionHistoryTables();

  const result = db().prepare('DELETE FROM execution_history WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * 清理执行历史（按时间范围或保留条数）
 */
export function purgeExecutionHistory(
  options: {
    beforeTime?: number; // 清理此时间之前的记录（毫秒）
    keepLatest?: number; // 保留最新的 N 条记录
  } = {},
): number {
  initExecutionHistoryTables();

  if (options.beforeTime !== undefined) {
    const result = db().prepare('DELETE FROM execution_history WHERE start_time < ?').run(options.beforeTime);
    return result.changes;
  }

  if (options.keepLatest !== undefined) {
    // 先获取总数
    const countRow = db().prepare('SELECT COUNT(*) as total FROM execution_history').get() as { total: number };
    const total = countRow.total;

    if (total <= options.keepLatest) return 0;

    // 获取需要删除的记录 ID
    const rows = db().prepare(`
      SELECT id FROM execution_history ORDER BY start_time DESC LIMIT ? OFFSET ?
    `).all(options.keepLatest, 0) as { id: string }[];

    if (rows.length === 0) return 0;

    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(', ');
    const result = db().prepare(`DELETE FROM execution_history WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }

  // 默认清理全部
  const result = db().prepare('DELETE FROM execution_history').run();
  return result.changes;
}

/**
 * 获取执行历史统计信息
 */
export function getExecutionHistoryStats(filter?: ExecutionHistoryFilter): ExecutionHistoryStats {
  initExecutionHistoryTables();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter?.type) {
    conditions.push('type = ?');
    params.push(filter.type);
  }
  if (filter?.startTimeFrom !== undefined) {
    conditions.push('start_time >= ?');
    params.push(filter.startTimeFrom);
  }
  if (filter?.startTimeTo !== undefined) {
    conditions.push('start_time <= ?');
    params.push(filter.startTimeTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 按状态统计
  const statusRows = db().prepare(`
    SELECT status, COUNT(*) as count FROM execution_history ${whereClause} GROUP BY status
  `).all(...params) as { status: string; count: number }[];
  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  // 按类型统计
  const typeRows = db().prepare(`
    SELECT type, COUNT(*) as count FROM execution_history ${whereClause} GROUP BY type
  `).all(...params) as { type: string; count: number }[];
  const byType: Record<string, number> = {};
  for (const row of typeRows) {
    byType[row.type] = row.count;
  }

  // 总数
  const countRow = db().prepare(`SELECT COUNT(*) as total FROM execution_history ${whereClause}`).get(...params) as { total: number };
  const total = countRow.total;

  // 平均耗时（仅计算已完成的）
  const avgRow = db().prepare(`
    SELECT AVG(duration) as avg_duration FROM execution_history ${whereClause} AND status != 'running' AND duration IS NOT NULL
  `).all(...params) as { avg_duration: number | null }[];
  const avgDuration = avgRow[0]?.avg_duration ?? 0;

  // 成功率
  const successCount = byStatus['success'] ?? 0;
  const completedTotal = total - (byStatus['running'] ?? 0);
  const successRate = completedTotal > 0 ? successCount / completedTotal : 0;

  return {
    total,
    byStatus,
    byType,
    avgDuration: Math.round(avgDuration),
    successRate: Math.round(successRate * 100) / 100,
  };
}