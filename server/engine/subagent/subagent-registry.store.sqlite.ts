/**
 * Subagent Registry Store SQLite — SQLite 存储实现
 *
 * 提供基于 SQLite 的子代理实例持久化存储。
 */

import Database from 'better-sqlite3';
import { logger } from '../../logger.js';
import type { SubagentInstance, SubagentStatus } from '../subagentRegistry.js';

const TABLE_NAME = 'subagent_instances';

export interface SubagentStoreRecord {
  id: string;
  definitionId: string;
  name: string;
  status: SubagentStatus;
  sessionKey: string;
  parentSessionKey: string | null;
  spawnedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  lastActivityAt: number | null;
  taskDescription: string | null;
  result: string | null;
  error: string | null;
  metadata: string | null;
  createdAt: number;
  updatedAt: number;
}

let dbInstance: Database.Database | null = null;
let initialized = false;

function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Subagent store database not initialized');
  }
  return dbInstance;
}

export function initSubagentStore(db: Database.Database): void {
  dbInstance = db;
  ensureTable();
  initialized = true;
  logger.debug('[SubagentSQLiteStore] Initialized');
}

function ensureTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      definitionId TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      sessionKey TEXT NOT NULL UNIQUE,
      parentSessionKey TEXT,
      spawnedAt INTEGER NOT NULL,
      startedAt INTEGER,
      completedAt INTEGER,
      lastActivityAt INTEGER,
      taskDescription TEXT,
      result TEXT,
      error TEXT,
      metadata TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subagent_status ON ${TABLE_NAME}(status);
    CREATE INDEX IF NOT EXISTS idx_subagent_definition ON ${TABLE_NAME}(definitionId);
    CREATE INDEX IF NOT EXISTS idx_subagent_parent_session ON ${TABLE_NAME}(parentSessionKey);
    CREATE INDEX IF NOT EXISTS idx_subagent_spawned_at ON ${TABLE_NAME}(spawnedAt);
    CREATE INDEX IF NOT EXISTS idx_subagent_last_activity ON ${TABLE_NAME}(lastActivityAt);
  `);
}

function serializeMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

function deserializeMetadata(metadata: string | null): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function recordToInstance(record: SubagentStoreRecord): SubagentInstance {
  return {
    id: record.id,
    definitionId: record.definitionId,
    name: record.name,
    status: record.status,
    sessionKey: record.sessionKey,
    parentSessionKey: record.parentSessionKey ?? undefined,
    spawnedAt: record.spawnedAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    lastActivityAt: record.lastActivityAt ?? undefined,
    taskDescription: record.taskDescription ?? undefined,
    result: record.result ? (() => {
      try {
        return JSON.parse(record.result as string);
      } catch {
        return record.result;
      }
    })() : undefined,
    error: record.error ?? undefined,
    metadata: deserializeMetadata(record.metadata),
  };
}

function instanceToRecord(instance: SubagentInstance): Omit<SubagentStoreRecord, 'createdAt' | 'updatedAt'> {
  return {
    id: instance.id,
    definitionId: instance.definitionId,
    name: instance.name,
    status: instance.status,
    sessionKey: instance.sessionKey,
    parentSessionKey: instance.parentSessionKey ?? null,
    spawnedAt: instance.spawnedAt,
    startedAt: instance.startedAt ?? null,
    completedAt: instance.completedAt ?? null,
    lastActivityAt: instance.lastActivityAt ?? null,
    taskDescription: instance.taskDescription ?? null,
    result: instance.result !== undefined ? (typeof instance.result === 'string' ? instance.result : JSON.stringify(instance.result)) : null,
    error: instance.error ?? null,
    metadata: serializeMetadata(instance.metadata),
  };
}

export function insertSubagentInstance(instance: SubagentInstance): void {
  if (!initialized) return;
  const db = getDb();
  const now = Date.now();
  const record = instanceToRecord(instance);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${TABLE_NAME} (
      id, definitionId, name, status, sessionKey, parentSessionKey,
      spawnedAt, startedAt, completedAt, lastActivityAt,
      taskDescription, result, error, metadata,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    record.id,
    record.definitionId,
    record.name,
    record.status,
    record.sessionKey,
    record.parentSessionKey,
    record.spawnedAt,
    record.startedAt,
    record.completedAt,
    record.lastActivityAt,
    record.taskDescription,
    record.result,
    record.error,
    record.metadata,
    now,
    now,
  );
}

export function updateSubagentInstance(instance: SubagentInstance): boolean {
  if (!initialized) return false;
  const db = getDb();
  const now = Date.now();
  const record = instanceToRecord(instance);

  const stmt = db.prepare(`
    UPDATE ${TABLE_NAME} SET
      definitionId = ?,
      name = ?,
      status = ?,
      sessionKey = ?,
      parentSessionKey = ?,
      spawnedAt = ?,
      startedAt = ?,
      completedAt = ?,
      lastActivityAt = ?,
      taskDescription = ?,
      result = ?,
      error = ?,
      metadata = ?,
      updatedAt = ?
    WHERE id = ?
  `);

  const result = stmt.run(
    record.definitionId,
    record.name,
    record.status,
    record.sessionKey,
    record.parentSessionKey,
    record.spawnedAt,
    record.startedAt,
    record.completedAt,
    record.lastActivityAt,
    record.taskDescription,
    record.result,
    record.error,
    record.metadata,
    now,
    record.id,
  );

  return result.changes > 0;
}

export function deleteSubagentInstance(instanceId: string): boolean {
  if (!initialized) return false;
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM ${TABLE_NAME} WHERE id = ?`);
  const result = stmt.run(instanceId);
  return result.changes > 0;
}

export function getSubagentInstance(instanceId: string): SubagentInstance | undefined {
  if (!initialized) return undefined;
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM ${TABLE_NAME} WHERE id = ?`);
  const record = stmt.get(instanceId) as SubagentStoreRecord | undefined;
  return record ? recordToInstance(record) : undefined;
}

export function getSubagentInstanceBySessionKey(sessionKey: string): SubagentInstance | undefined {
  if (!initialized) return undefined;
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM ${TABLE_NAME} WHERE sessionKey = ?`);
  const record = stmt.get(sessionKey) as SubagentStoreRecord | undefined;
  return record ? recordToInstance(record) : undefined;
}

export function listSubagentInstances(options?: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
  limit?: number;
  offset?: number;
}): SubagentInstance[] {
  if (!initialized) return [];
  const db = getDb();

  let query = `SELECT * FROM ${TABLE_NAME} WHERE 1=1`;
  const params: (string | number)[] = [];

  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    const placeholders = statuses.map(() => '?').join(', ');
    query += ` AND status IN (${placeholders})`;
    params.push(...statuses);
  }

  if (options?.definitionId) {
    query += ' AND definitionId = ?';
    params.push(options.definitionId);
  }

  if (options?.parentSessionKey) {
    query += ' AND parentSessionKey = ?';
    params.push(options.parentSessionKey);
  }

  query += ' ORDER BY spawnedAt DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const stmt = db.prepare(query);
  const records = stmt.all(...params) as SubagentStoreRecord[];
  return records.map(recordToInstance);
}

export function countSubagentInstances(options?: {
  status?: SubagentStatus | SubagentStatus[];
  definitionId?: string;
  parentSessionKey?: string;
}): number {
  if (!initialized) return 0;
  const db = getDb();

  let query = `SELECT COUNT(*) as count FROM ${TABLE_NAME} WHERE 1=1`;
  const params: (string | number)[] = [];

  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    const placeholders = statuses.map(() => '?').join(', ');
    query += ` AND status IN (${placeholders})`;
    params.push(...statuses);
  }

  if (options?.definitionId) {
    query += ' AND definitionId = ?';
    params.push(options.definitionId);
  }

  if (options?.parentSessionKey) {
    query += ' AND parentSessionKey = ?';
    params.push(options.parentSessionKey);
  }

  const stmt = db.prepare(query);
  const result = stmt.get(...params) as { count: number };
  return result.count;
}

export function cleanupOldSubagentInstances(olderThanMs: number): number {
  if (!initialized) return 0;
  const db = getDb();
  const cutoffTime = Date.now() - olderThanMs;

  const stmt = db.prepare(`
    DELETE FROM ${TABLE_NAME}
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND completedAt IS NOT NULL
    AND completedAt < ?
  `);

  const result = stmt.run(cutoffTime);
  if (result.changes > 0) {
    logger.debug(`[SubagentSQLiteStore] Cleaned up ${result.changes} old subagent instances`);
  }
  return result.changes;
}

export function clearSubagentStore(): void {
  if (!initialized) return;
  const db = getDb();
  db.exec(`DELETE FROM ${TABLE_NAME}`);
  logger.debug('[SubagentSQLiteStore] Cleared all subagent instances');
}

export function getSubagentStoreStats(): {
  total: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  spawning: number;
  paused: number;
} {
  if (!initialized) {
    return { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0, spawning: 0, paused: 0 };
  }
  const db = getDb();
  const stmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM ${TABLE_NAME}
    GROUP BY status
  `);
  const rows = stmt.all() as { status: string; count: number }[];

  const stats = { total: 0, running: 0, completed: 0, failed: 0, cancelled: 0, spawning: 0, paused: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status === 'running') stats.running = row.count;
    else if (row.status === 'completed') stats.completed = row.count;
    else if (row.status === 'failed') stats.failed = row.count;
    else if (row.status === 'cancelled') stats.cancelled = row.count;
    else if (row.status === 'spawning') stats.spawning = row.count;
    else if (row.status === 'paused') stats.paused = row.count;
  }
  return stats;
}

export function isSubagentStoreInitialized(): boolean {
  return initialized;
}

export function getSubagentStoreDb(): Database.Database | null {
  return dbInstance;
}