import type Database from 'better-sqlite3';
import { logger } from '../../logger.js';
import {
  readUserVersion,
  writeUserVersion,
  tableExists,
  ensureColumn,
} from './sqlite-schema-shape.js';
import type { Migration, MigrationState, SchemaMeta } from './types.js';

export const SCHEMA_META_TABLE = 'schema_meta';
export const MIGRATION_HISTORY_TABLE = 'migration_history';

export class SchemaManager {
  private db: Database.Database;
  private migrations: Migration[];
  private currentVersion: number;
  private role: string;
  private agentId?: string;

  constructor(
    db: Database.Database,
    options: {
      migrations?: Migration[];
      role: string;
      agentId?: string;
    }
  ) {
    this.db = db;
    this.migrations = options.migrations ?? [];
    this.currentVersion = 0;
    this.role = options.role;
    this.agentId = options.agentId;
    this.ensureMetaTables();
    this.currentVersion = this.getCurrentVersion();
  }

  private ensureMetaTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_META_TABLE} (
        meta_key TEXT NOT NULL PRIMARY KEY,
        role TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        agent_id TEXT,
        app_version TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${MIGRATION_HISTORY_TABLE} (
        version INTEGER NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_migration_history_status
        ON ${MIGRATION_HISTORY_TABLE}(status, applied_at DESC);
    `);
  }

  getCurrentVersion(): number {
    const row = this.db
      .prepare(`SELECT schema_version FROM ${SCHEMA_META_TABLE} WHERE meta_key = ?`)
      .get('primary') as { schema_version: number } | undefined;
    return row?.schema_version ?? 0;
  }

  getLatestMigrationVersion(): number {
    if (this.migrations.length === 0) return 0;
    return Math.max(...this.migrations.map((m) => m.version));
  }

  needsMigration(): boolean {
    return this.currentVersion < this.getLatestMigrationVersion();
  }

  getPendingMigrations(): Migration[] {
    return this.migrations
      .filter((m) => m.version > this.currentVersion)
      .sort((a, b) => a.version - b.version);
  }

  getMigrationHistory(): MigrationState[] {
    if (!tableExists(this.db, MIGRATION_HISTORY_TABLE)) {
      return [];
    }
    const rows = this.db
      .prepare(`SELECT * FROM ${MIGRATION_HISTORY_TABLE} ORDER BY version ASC`)
      .all() as Array<{
      version: number;
      name: string;
      applied_at: number;
      duration_ms: number;
      status: string;
      error: string | null;
    }>;
    return rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at,
      durationMs: row.duration_ms,
      status: row.status as MigrationState['status'],
      error: row.error ?? undefined,
    }));
  }

  applyMigrations(): {
    success: boolean;
    applied: MigrationState[];
    errors: Array<{ version: number; name: string; error: string }>;
  } {
    const pending = this.getPendingMigrations();
    const applied: MigrationState[] = [];
    const errors: Array<{ version: number; name: string; error: string }> = [];

    for (const migration of pending) {
      const startTime = Date.now();
      try {
        this.db.transaction(() => {
          migration.up(this.db);
          writeUserVersion(this.db, migration.version);
          this.upsertSchemaMeta(migration.version);
          this.recordMigration(migration, 'success', startTime);
        })();
        applied.push({
          version: migration.version,
          name: migration.name,
          appliedAt: startTime,
          durationMs: Date.now() - startTime,
          status: 'success',
        });
        this.currentVersion = migration.version;
        logger.info(`[SchemaManager] Migration v${migration.version} ${migration.name} applied successfully`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ version: migration.version, name: migration.name, error: errorMsg });
        this.recordMigration(migration, 'failed', startTime, errorMsg);
        logger.error(`[SchemaManager] Migration v${migration.version} ${migration.name} failed:`, errorMsg);
        break;
      }
    }

    return {
      success: errors.length === 0,
      applied,
      errors,
    };
  }

  private recordMigration(
    migration: Migration,
    status: MigrationState['status'],
    startTime: number,
    error?: string
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ${MIGRATION_HISTORY_TABLE}
         (version, name, applied_at, duration_ms, status, error)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        migration.version,
        migration.name,
        startTime,
        Date.now() - startTime,
        status,
        error ?? null
      );
  }

  private upsertSchemaMeta(version: number): void {
    const now = Date.now();
    const existing = this.db
      .prepare(`SELECT meta_key FROM ${SCHEMA_META_TABLE} WHERE meta_key = ?`)
      .get('primary');

    if (existing) {
      this.db
        .prepare(
          `UPDATE ${SCHEMA_META_TABLE}
           SET schema_version = ?, updated_at = ?
           WHERE meta_key = ?`
        )
        .run(version, now, 'primary');
    } else {
      this.db
        .prepare(
          `INSERT INTO ${SCHEMA_META_TABLE}
           (meta_key, role, schema_version, agent_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          'primary',
          this.role,
          version,
          this.agentId ?? null,
          now,
          now
        );
    }
  }

  getSchemaMeta(): SchemaMeta | null {
    const row = this.db
      .prepare(`SELECT * FROM ${SCHEMA_META_TABLE} WHERE meta_key = ?`)
      .get('primary') as
      | {
      meta_key: string;
      role: string;
      schema_version: number;
      agent_id: string | null;
      app_version: string | null;
      created_at: number;
      updated_at: number;
    }
      | undefined;
    if (!row) return null;
    return {
      metaKey: row.meta_key,
      role: row.role,
      schemaVersion: row.schema_version,
      agentId: row.agent_id,
      appVersion: row.app_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  initializeSchema(schemaSql: string, initialVersion: number): boolean {
    if (this.currentVersion > 0) {
      return false;
    }
    const startTime = Date.now();
    try {
      this.db.transaction(() => {
        this.db.exec(schemaSql);
        writeUserVersion(this.db, initialVersion);
        this.upsertSchemaMeta(initialVersion);
      })();
      this.currentVersion = initialVersion;
      logger.info(`[SchemaManager] Schema initialized at v${initialVersion}`);
      return true;
    } catch (err) {
      logger.error('[SchemaManager] Schema initialization failed:', err);
      return false;
    }
  }

  ensureAdditiveMigrations(columnMigrations: Array<{ table: string; columns: string[] }>): number {
    let addedCount = 0;
    for (const { table, columns } of columnMigrations) {
      for (const columnDef of columns) {
        if (ensureColumn(this.db, table, columnDef)) {
          addedCount++;
          logger.debug(`[SchemaManager] Added column ${columnDef.split(' ')[0]} to ${table}`);
        }
      }
    }
    return addedCount;
  }
}

export function createStateMigrations(): Migration[] {
  return [
    {
      version: 1,
      name: 'initial_state_schema',
      up: (db: Database.Database) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS state_config (
            config_key TEXT NOT NULL PRIMARY KEY,
            config_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS state_cache (
            cache_key TEXT NOT NULL PRIMARY KEY,
            value_json TEXT NOT NULL,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_state_cache_expires
            ON state_cache(expires_at)
            WHERE expires_at IS NOT NULL;

          CREATE TABLE IF NOT EXISTS state_queue (
            queue_name TEXT NOT NULL,
            item_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            claimed_at INTEGER,
            claimed_by TEXT,
            PRIMARY KEY (queue_name, item_id)
          );

          CREATE INDEX IF NOT EXISTS idx_state_queue_status
            ON state_queue(queue_name, status, created_at, item_id);
        `);
      },
    },
    {
      version: 2,
      name: 'add_agent_databases',
      up: (db: Database.Database) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS agent_databases (
            agent_id TEXT NOT NULL,
            path TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL,
            size_bytes INTEGER,
            PRIMARY KEY (agent_id, path)
          );

          CREATE INDEX IF NOT EXISTS idx_agent_databases_agent
            ON agent_databases(agent_id, last_seen_at DESC);
        `);
      },
    },
    {
      version: 3,
      name: 'add_plugin_state',
      up: (db: Database.Database) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS plugin_state_entries (
            plugin_id TEXT NOT NULL,
            namespace TEXT NOT NULL,
            entry_key TEXT NOT NULL,
            value_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER,
            PRIMARY KEY (plugin_id, namespace, entry_key)
          );

          CREATE INDEX IF NOT EXISTS idx_plugin_state_expiry
            ON plugin_state_entries(expires_at)
            WHERE expires_at IS NOT NULL;

          CREATE INDEX IF NOT EXISTS idx_plugin_state_listing
            ON plugin_state_entries(plugin_id, namespace, created_at, entry_key);
        `);
      },
    },
  ];
}

export function createAgentMigrations(): Migration[] {
  return [
    {
      version: 1,
      name: 'initial_agent_schema',
      up: (db: Database.Database) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS agent_sessions (
            session_id TEXT NOT NULL PRIMARY KEY,
            session_key TEXT NOT NULL UNIQUE,
            title TEXT,
            model TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_active_at INTEGER,
            status TEXT NOT NULL DEFAULT 'active'
          );

          CREATE INDEX IF NOT EXISTS idx_agent_sessions_status
            ON agent_sessions(status, updated_at DESC);

          CREATE TABLE IF NOT EXISTS agent_messages (
            message_id TEXT NOT NULL PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            model TEXT,
            timestamp INTEGER NOT NULL,
            tool_calls_json TEXT,
            thinking TEXT,
            thinking_duration_ms INTEGER,
            FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_agent_messages_session
            ON agent_messages(session_id, timestamp DESC);

          CREATE TABLE IF NOT EXISTS agent_tool_calls (
            tool_call_id TEXT NOT NULL PRIMARY KEY,
            session_id TEXT NOT NULL,
            message_id TEXT,
            tool_name TEXT NOT NULL,
            arguments_json TEXT,
            result_json TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL,
            completed_at INTEGER,
            duration_ms INTEGER,
            error TEXT,
            FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_session
            ON agent_tool_calls(session_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS cache_entries (
            scope TEXT NOT NULL,
            key TEXT NOT NULL,
            value_json TEXT NOT NULL,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (scope, key)
          );

          CREATE INDEX IF NOT EXISTS idx_agent_cache_expiry
            ON cache_entries(expires_at)
            WHERE expires_at IS NOT NULL;
        `);
      },
    },
  ];
}
