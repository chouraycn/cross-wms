import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import {
  resolveStateDatabasePath,
  resolveStateDatabaseDir,
  getRelatedDatabaseFiles,
} from './db-paths.js';
import { SchemaManager, createStateMigrations } from './schema-manager.js';
import type { StateDatabaseOptions, OpenStateDatabase } from './types.js';

const STATE_DB_BUSY_TIMEOUT_MS = 30_000;
const STATE_DB_DIR_MODE = 0o700;
const STATE_DB_FILE_MODE = 0o600;

const cachedDatabases = new Map<string, OpenStateDatabase>();

function ensureStateDatabasePermissions(pathname: string): void {
  const dir = path.dirname(pathname);
  const dirExisted = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true, mode: STATE_DB_DIR_MODE });
  if (!dirExisted) {
    try {
      fs.chmodSync(dir, STATE_DB_DIR_MODE);
    } catch {
      logger.debug('[StateDB] Cannot chmod state dir, continuing');
    }
  }
  for (const candidate of getRelatedDatabaseFiles(pathname)) {
    if (fs.existsSync(candidate)) {
      try {
        fs.chmodSync(candidate, STATE_DB_FILE_MODE);
      } catch {
        logger.debug(`[StateDB] Cannot chmod ${candidate}, continuing`);
      }
    }
  }
}

function configureDatabasePragmas(db: Database.Database): void {
  db.pragma(`busy_timeout = ${STATE_DB_BUSY_TIMEOUT_MS}`);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
}

export function openStateDatabase(options: StateDatabaseOptions = {}): OpenStateDatabase {
  const pathname = resolveStateDatabasePath(options);
  const cached = cachedDatabases.get(pathname);
  if (cached && cached.db.open) {
    return cached;
  }
  if (cached) {
    try {
      cached.db.close();
    } catch {
      // ignore
    }
    cachedDatabases.delete(pathname);
  }

  ensureStateDatabasePermissions(pathname);

  const db = new Database(pathname);
  try {
    configureDatabasePragmas(db);

    const schemaManager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });

    if (!schemaManager.needsMigration() && schemaManager.getCurrentVersion() === 0) {
      logger.info('[StateDB] Initializing state database schema...');
    }

    const migrationResult = schemaManager.applyMigrations();
    if (!migrationResult.success) {
      throw new Error(
        `State database migration failed: ${migrationResult.errors
          .map((e) => `v${e.version} ${e.name}: ${e.error}`)
          .join(', ')}`
      );
    }

    if (migrationResult.applied.length > 0) {
      logger.info(
        `[StateDB] Applied ${migrationResult.applied.length} migration(s)`,
        migrationResult.applied.map((m) => `v${m.version} ${m.name}`)
      );
    }

    const schemaVersion = schemaManager.getCurrentVersion();
    const result: OpenStateDatabase = { db, path: pathname, schemaVersion };
    cachedDatabases.set(pathname, result);
    ensureStateDatabasePermissions(pathname);
    return result;
  } catch (err) {
    try {
      db.close();
    } catch {
      // ignore
    }
    throw err;
  }
}

export function closeStateDatabase(): void {
  for (const database of cachedDatabases.values()) {
    try {
      if (database.db.open) {
        database.db.pragma('wal_checkpoint(TRUNCATE)');
        database.db.close();
      }
    } catch (err) {
      logger.warn('[StateDB] Error closing database:', err);
    }
  }
  cachedDatabases.clear();
}

export function isStateDatabaseOpen(): boolean {
  return Array.from(cachedDatabases.values()).some((db) => db.db.open);
}

export function runStateWriteTransaction<T>(
  operation: (database: OpenStateDatabase) => T,
  options: StateDatabaseOptions = {}
): T {
  const database = openStateDatabase(options);
  const runTransaction = database.db.transaction(() => operation(database));
  const result = runTransaction();
  try {
    ensureStateDatabasePermissions(database.path);
  } catch {
    // ignore
  }
  return result;
}

export function getStateDatabaseSchemaManager(
  options: StateDatabaseOptions = {}
): SchemaManager {
  const database = openStateDatabase(options);
  return new SchemaManager(database.db, {
    migrations: createStateMigrations(),
    role: 'global',
  });
}

export function setStateConfig(key: string, value: unknown, options: StateDatabaseOptions = {}): void {
  runStateWriteTransaction(({ db }) => {
    const now = Date.now();
    db.prepare(
      `INSERT OR REPLACE INTO state_config (config_key, config_json, updated_at)
       VALUES (?, ?, ?)`
    ).run(key, JSON.stringify(value), now);
  }, options);
}

export function getStateConfig<T = unknown>(
  key: string,
  options: StateDatabaseOptions = {}
): T | null {
  const { db } = openStateDatabase(options);
  const row = db
    .prepare('SELECT config_json FROM state_config WHERE config_key = ?')
    .get(key) as { config_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.config_json) as T;
}

export function setStateCache(
  key: string,
  value: unknown,
  expiresAt?: number,
  options: StateDatabaseOptions = {}
): void {
  runStateWriteTransaction(({ db }) => {
    const now = Date.now();
    db.prepare(
      `INSERT OR REPLACE INTO state_cache (cache_key, value_json, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      key,
      JSON.stringify(value),
      expiresAt ?? null,
      now,
      now
    );
  }, options);
}

export function getStateCache<T = unknown>(
  key: string,
  options: StateDatabaseOptions = {}
): { value: T; expiresAt: number | null } | null {
  const { db } = openStateDatabase(options);
  const now = Date.now();
  const row = db
    .prepare(
      'SELECT value_json, expires_at FROM state_cache WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > ?)'
    )
    .get(key, now) as { value_json: string; expires_at: number | null } | undefined;
  if (!row) return null;
  return {
    value: JSON.parse(row.value_json) as T,
    expiresAt: row.expires_at,
  };
}

export function deleteStateCache(key: string, options: StateDatabaseOptions = {}): boolean {
  const result = runStateWriteTransaction(({ db }) => {
    const info = db.prepare('DELETE FROM state_cache WHERE cache_key = ?').run(key);
    return info.changes > 0;
  }, options);
  return result;
}

export function cleanupExpiredCache(options: StateDatabaseOptions = {}): number {
  const result = runStateWriteTransaction(({ db }) => {
    const info = db.prepare('DELETE FROM state_cache WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());
    return info.changes;
  }, options);
  logger.debug(`[StateDB] Cleaned up ${result} expired cache entries`);
  return result;
}

export function enqueueItem(
  queueName: string,
  itemId: string,
  payload: unknown,
  priority = 0,
  options: StateDatabaseOptions = {}
): void {
  runStateWriteTransaction(({ db }) => {
    const now = Date.now();
    db.prepare(
      `INSERT OR REPLACE INTO state_queue (queue_name, item_id, payload_json, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      queueName,
      itemId,
      JSON.stringify(payload),
      priority,
      now,
      now
    );
  }, options);
}

export function dequeueItem(
  queueName: string,
  claimedBy: string,
  options: StateDatabaseOptions = {}
): { itemId: string; payload: unknown } | null {
  return runStateWriteTransaction(({ db }) => {
    const now = Date.now();
    const row = db
      .prepare(
        `SELECT item_id, payload_json FROM state_queue
         WHERE queue_name = ? AND status = 'pending'
         ORDER BY priority DESC, created_at ASC, item_id ASC
         LIMIT 1`
      )
      .get(queueName) as { item_id: string; payload_json: string } | undefined;

    if (!row) return null;

    db.prepare(
      `UPDATE state_queue
       SET status = 'claimed', claimed_at = ?, claimed_by = ?, updated_at = ?
       WHERE queue_name = ? AND item_id = ?`
    ).run(now, claimedBy, now, queueName, row.item_id);

    return {
      itemId: row.item_id,
      payload: JSON.parse(row.payload_json),
    };
  }, options);
}

export function completeQueueItem(
  queueName: string,
  itemId: string,
  options: StateDatabaseOptions = {}
): boolean {
  const result = runStateWriteTransaction(({ db }) => {
    const info = db.prepare(
      `UPDATE state_queue SET status = 'completed', updated_at = ? WHERE queue_name = ? AND item_id = ?`
    ).run(Date.now(), queueName, itemId);
    return info.changes > 0;
  }, options);
  return result;
}

export function failQueueItem(
  queueName: string,
  itemId: string,
  error: string,
  options: StateDatabaseOptions = {}
): boolean {
  const result = runStateWriteTransaction(({ db }) => {
    const info = db.prepare(
      `UPDATE state_queue SET status = 'failed', updated_at = ? WHERE queue_name = ? AND item_id = ?`
    ).run(Date.now(), queueName, itemId);
    return info.changes > 0;
  }, options);
  return result;
}

export function getQueueStats(queueName: string, options: StateDatabaseOptions = {}): {
  pending: number;
  claimed: number;
  completed: number;
  failed: number;
} {
  const { db } = openStateDatabase(options);
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM state_queue WHERE queue_name = ? GROUP BY status`
    )
    .all(queueName) as Array<{ status: string; count: number }>;

  const stats = { pending: 0, claimed: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    stats[row.status as keyof typeof stats] = row.count;
  }
  return stats;
}

export function registerAgentDatabase(
  agentId: string,
  dbPath: string,
  schemaVersion: number,
  options: StateDatabaseOptions = {}
): void {
  runStateWriteTransaction(({ db }) => {
    const now = Date.now();
    let sizeBytes: number | null = null;
    try {
      sizeBytes = fs.statSync(dbPath).size;
    } catch {
      sizeBytes = null;
    }
    db.prepare(
      `INSERT OR REPLACE INTO agent_databases
       (agent_id, path, schema_version, last_seen_at, size_bytes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(agentId, dbPath, schemaVersion, now, sizeBytes);
  }, options);
}

export function listAgentDatabases(
  options: StateDatabaseOptions = {}
): Array<{
  agentId: string;
  path: string;
  schemaVersion: number;
  lastSeenAt: number;
  sizeBytes: number | null;
}> {
  const { db } = openStateDatabase(options);
  const rows = db
    .prepare('SELECT agent_id, path, schema_version, last_seen_at, size_bytes FROM agent_databases ORDER BY last_seen_at DESC')
    .all() as Array<{
    agent_id: string;
    path: string;
    schema_version: number;
    last_seen_at: number;
    size_bytes: number | null;
  }>;
  return rows.map((row) => ({
    agentId: row.agent_id,
    path: row.path,
    schemaVersion: row.schema_version,
    lastSeenAt: row.last_seen_at,
    sizeBytes: row.size_bytes,
  }));
}

export const closeStateDatabaseForTest = closeStateDatabase;

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const openOpenClawStateDatabase: any = undefined as any;
export const runOpenClawStateWriteTransaction: any = undefined as any;
