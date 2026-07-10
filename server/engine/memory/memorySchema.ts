import type Database from 'better-sqlite3';
import { DatabaseManager } from '../../storage/databaseManager.js';
import { logger } from '../../logger.js';

export const MEMORY_INDEX_META_TABLE = 'memory_index_meta';
export const MEMORY_INDEX_SOURCES_TABLE = 'memory_index_sources';
export const MEMORY_INDEX_CHUNKS_TABLE = 'memory_index_chunks';
export const MEMORY_EMBEDDING_CACHE_TABLE = 'memory_embedding_cache';
export const MEMORY_INDEX_STATE_TABLE = 'memory_index_state';
export const MEMORY_INDEX_FTS_TABLE = 'memory_index_chunks_fts';
export const MEMORY_INDEX_VECTOR_TABLE = 'memory_index_chunks_vec';

const MEMORY_INDEX_SOURCE_COLUMNS = ['path', 'source', 'hash', 'mtime', 'size'] as const;

function tableHasExactColumns(db: Database.Database, tableName: string, expected: readonly string[]): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: unknown }>;
  const columns = new Set(rows.flatMap((row) => (typeof row.name === 'string' ? [row.name] : [])));
  return columns.size === expected.length && expected.every((column) => columns.has(column));
}

function tablePrimaryKeyColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name?: unknown;
    pk?: unknown;
  }>;
  return rows
    .flatMap((row) =>
      typeof row.name === 'string' && typeof row.pk === 'number' && row.pk > 0
        ? [{ name: row.name, pk: row.pk }]
        : [],
    )
    .toSorted((left, right) => left.pk - right.pk)
    .map((row) => row.name);
}

function tableHasPrimaryKey(db: Database.Database, tableName: string, expectedColumns: readonly string[]): boolean {
  const columns = tablePrimaryKeyColumns(db, tableName);
  return (
    columns.length === expectedColumns.length &&
    columns.every((column, index) => column === expectedColumns[index])
  );
}

function migrateCanonicalMemoryIndexSourcesPrimaryKey(db: Database.Database): void {
  if (
    !tableHasExactColumns(db, MEMORY_INDEX_SOURCES_TABLE, MEMORY_INDEX_SOURCE_COLUMNS) ||
    tableHasPrimaryKey(db, MEMORY_INDEX_SOURCES_TABLE, ['path', 'source'])
  ) {
    return;
  }
  if (!tableHasPrimaryKey(db, MEMORY_INDEX_SOURCES_TABLE, ['path'])) {
    return;
  }

  db.exec('SAVEPOINT migrate_memory_index_sources_primary_key');
  try {
    db.exec(`
      DROP TRIGGER IF EXISTS memory_index_sources_revision_after_insert;
      DROP TRIGGER IF EXISTS memory_index_sources_revision_after_update;
      DROP TRIGGER IF EXISTS memory_index_sources_revision_after_delete;

      ALTER TABLE ${MEMORY_INDEX_SOURCES_TABLE}
        RENAME TO memory_index_sources_path_pk_migration;
      CREATE TABLE ${MEMORY_INDEX_SOURCES_TABLE} (
        path TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'memory',
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL,
        PRIMARY KEY (path, source)
      );
      INSERT INTO ${MEMORY_INDEX_SOURCES_TABLE} (path, source, hash, mtime, size)
      SELECT path, source, hash, mtime, size FROM memory_index_sources_path_pk_migration;
      DROP TABLE memory_index_sources_path_pk_migration;
      RELEASE migrate_memory_index_sources_primary_key;
    `);
  } catch (err) {
    db.exec('ROLLBACK TO migrate_memory_index_sources_primary_key');
    db.exec('RELEASE migrate_memory_index_sources_primary_key');
    throw err;
  }
}

function migrateLegacyMemoryIndexTables(db: Database.Database): void {
  const hasLegacyCoreTables =
    tableHasExactColumns(db, 'meta', ['key', 'value']) &&
    tableHasExactColumns(db, 'files', ['path', 'source', 'hash', 'mtime', 'size']) &&
    tableHasExactColumns(db, 'chunks', [
      'id',
      'path',
      'source',
      'start_line',
      'end_line',
      'hash',
      'model',
      'text',
      'embedding',
      'updated_at',
    ]);
  if (!hasLegacyCoreTables) {
    return;
  }

  db.exec('SAVEPOINT migrate_legacy_memory_index_tables');
  try {
    db.exec(`
      INSERT OR IGNORE INTO ${MEMORY_INDEX_META_TABLE} (key, value)
      SELECT key, value FROM meta;

      INSERT OR IGNORE INTO ${MEMORY_INDEX_SOURCES_TABLE} (path, source, hash, mtime, size)
      SELECT path, source, hash, mtime, size FROM files;

      INSERT OR IGNORE INTO ${MEMORY_INDEX_CHUNKS_TABLE} (
        id, path, source, start_line, end_line, hash, model, text, embedding, updated_at
      )
      SELECT id, path, source, start_line, end_line, hash, model, text, embedding, updated_at
      FROM chunks;
    `);

    db.exec(`
      DROP TABLE IF EXISTS chunks_fts;
      DROP TABLE chunks;
      DROP TABLE files;
      DROP TABLE meta;
      RELEASE migrate_legacy_memory_index_tables;
    `);
  } catch (err) {
    db.exec('ROLLBACK TO migrate_legacy_memory_index_tables');
    db.exec('RELEASE migrate_legacy_memory_index_tables');
    throw err;
  }
}

export interface MemorySchemaOptions {
  cacheEnabled?: boolean;
  ftsEnabled?: boolean;
  ftsTokenizer?: 'unicode61' | 'trigram';
}

export function ensureMemoryIndexSchema(options: MemorySchemaOptions = {}): { ftsAvailable: boolean; ftsError?: string } {
  const db = DatabaseManager.getVecDb();
  const cacheEnabled = options.cacheEnabled ?? true;
  const ftsEnabled = options.ftsEnabled ?? true;
  const ftsTokenizer = options.ftsTokenizer ?? 'unicode61';

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MEMORY_INDEX_META_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${MEMORY_INDEX_SOURCES_TABLE} (
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      PRIMARY KEY (path, source)
    );
    CREATE TABLE IF NOT EXISTS ${MEMORY_INDEX_CHUNKS_TABLE} (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${MEMORY_INDEX_STATE_TABLE} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO ${MEMORY_INDEX_STATE_TABLE} (id, revision) VALUES (1, 0);
  `);

  migrateCanonicalMemoryIndexSourcesPrimaryKey(db);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memory_index_sources_revision_after_insert
    AFTER INSERT ON ${MEMORY_INDEX_SOURCES_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_index_sources_revision_after_update
    AFTER UPDATE ON ${MEMORY_INDEX_SOURCES_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_index_sources_revision_after_delete
    AFTER DELETE ON ${MEMORY_INDEX_SOURCES_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;

    CREATE TRIGGER IF NOT EXISTS memory_index_chunks_revision_after_insert
    AFTER INSERT ON ${MEMORY_INDEX_CHUNKS_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_index_chunks_revision_after_update
    AFTER UPDATE ON ${MEMORY_INDEX_CHUNKS_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_index_chunks_revision_after_delete
    AFTER DELETE ON ${MEMORY_INDEX_CHUNKS_TABLE}
    BEGIN
      UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1;
    END;

    CREATE INDEX IF NOT EXISTS idx_memory_index_sources_source
      ON ${MEMORY_INDEX_SOURCES_TABLE}(source);
    CREATE INDEX IF NOT EXISTS idx_memory_index_chunks_path_source
      ON ${MEMORY_INDEX_CHUNKS_TABLE}(path, source);
    CREATE INDEX IF NOT EXISTS idx_memory_index_chunks_path
      ON ${MEMORY_INDEX_CHUNKS_TABLE}(path);
    CREATE INDEX IF NOT EXISTS idx_memory_index_chunks_source
      ON ${MEMORY_INDEX_CHUNKS_TABLE}(source);
  `);

  migrateLegacyMemoryIndexTables(db);

  if (cacheEnabled) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${MEMORY_EMBEDDING_CACHE_TABLE} (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        hash TEXT NOT NULL,
        embedding TEXT NOT NULL,
        dims INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model, provider_key, hash)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_embedding_cache_updated_at
        ON ${MEMORY_EMBEDDING_CACHE_TABLE}(updated_at);
    `);
  }

  let ftsAvailable = false;
  let ftsError: string | undefined;
  if (ftsEnabled) {
    try {
      const tokenizer = ftsTokenizer;
      const tokenizeClause = tokenizer === 'trigram' ? `, tokenize='trigram case_sensitive 0'` : '';
      db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${MEMORY_INDEX_FTS_TABLE} USING fts5(\n` +
          `  text,\n` +
          `  id UNINDEXED,\n` +
          `  path UNINDEXED,\n` +
          `  source UNINDEXED,\n` +
          `  model UNINDEXED,\n` +
          `  start_line UNINDEXED,\n` +
          `  end_line UNINDEXED\n` +
          `${tokenizeClause});`,
      );
      db.exec(`
        INSERT INTO ${MEMORY_INDEX_FTS_TABLE} (
          text, id, path, source, model, start_line, end_line
        )
        SELECT text, id, path, source, model, start_line, end_line
        FROM ${MEMORY_INDEX_CHUNKS_TABLE}
        WHERE NOT EXISTS (SELECT 1 FROM ${MEMORY_INDEX_FTS_TABLE} LIMIT 1);
      `);
      ftsAvailable = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ftsAvailable = false;
      ftsError = message;
      logger.warn(`[MemorySchema] FTS 创建失败: ${message}`);
    }
  }

  logger.info(`[MemorySchema] 记忆索引 Schema 初始化完成 (FTS: ${ftsAvailable ? 'enabled' : 'disabled'})`);
  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}

export function getMemoryRevision(db?: Database.Database): number {
  const database = db ?? DatabaseManager.getVecDb();
  const result = database.prepare(`SELECT revision FROM ${MEMORY_INDEX_STATE_TABLE} WHERE id = 1`).get() as { revision?: number } | undefined;
  return result?.revision ?? 0;
}

export function incrementMemoryRevision(db?: Database.Database): void {
  const database = db ?? DatabaseManager.getVecDb();
  database.exec(`UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = revision + 1 WHERE id = 1`);
}

export function getMemoryStats(db?: Database.Database): { totalChunks: number; totalSources: number; revision: number } {
  const database = db ?? DatabaseManager.getVecDb();
  const chunksResult = database.prepare(`SELECT COUNT(*) as count FROM ${MEMORY_INDEX_CHUNKS_TABLE}`).get() as { count?: number };
  const sourcesResult = database.prepare(`SELECT COUNT(*) as count FROM ${MEMORY_INDEX_SOURCES_TABLE}`).get() as { count?: number };
  const revision = getMemoryRevision(database);
  return {
    totalChunks: chunksResult?.count ?? 0,
    totalSources: sourcesResult?.count ?? 0,
    revision,
  };
}

export function clearAllMemory(db?: Database.Database): void {
  const database = db ?? DatabaseManager.getVecDb();
  database.exec(`DELETE FROM ${MEMORY_INDEX_CHUNKS_TABLE}`);
  database.exec(`DELETE FROM ${MEMORY_INDEX_SOURCES_TABLE}`);
  database.exec(`DELETE FROM ${MEMORY_INDEX_META_TABLE}`);
  database.exec(`DELETE FROM ${MEMORY_EMBEDDING_CACHE_TABLE}`);
  database.exec(`DELETE FROM ${MEMORY_INDEX_FTS_TABLE}`);
  database.exec(`UPDATE ${MEMORY_INDEX_STATE_TABLE} SET revision = 0 WHERE id = 1`);
}
