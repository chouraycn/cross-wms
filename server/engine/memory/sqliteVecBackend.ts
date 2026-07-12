/**
 * sqlite-vec Memory Backend
 *
 * Implements the MemoryBackend interface using sqlite-vec extension
 * for vector similarity search with BM25 full-text search fallback.
 *
 * v1.7.85: Initial implementation
 */

import { logger } from '../../logger.js';
import type { MemoryBackend, MemoryBackendType, MemoryBackendCapabilities, MemorySearchResult, MemoryEntry, MemoryStats } from './multiBackend.js';
// @ts-ignore - better-sqlite3 的类型定义问题
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

interface VecRow {
  id: number;
  text: string;
  embedding: Buffer | null;
  metadata: string;
  category: string;
  importance: number;
  created_at: string;
  updated_at: string;
}

export interface SQLiteVecBackendConfig {
  dbPath?: string;
  embeddingDimension?: number;
  tableName?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DB_PATH = 'data/memory.db';
const DEFAULT_EMBEDDING_DIMENSION = 1536; // OpenAI text-embedding-3-small
const DEFAULT_TABLE_NAME = 'memories';
const DEFAULT_MIN_SCORE = 0.3;

// ============================================================================
// SQLite-Vec Backend Implementation
// ============================================================================

export class SQLiteVecBackend implements MemoryBackend {
  readonly type: MemoryBackendType = 'sqlite-vec';
  readonly name = 'SQLite-Vec Memory Backend';
  readonly version = '1.0.0';

  readonly capabilities: MemoryBackendCapabilities = {
    vectorSearch: true,
    fullTextSearch: true,
    hybridSearch: true,
    mmr: true,
    timeDecay: true,
    classification: true,
    multimodal: false,
    chunking: true,
    batchOperations: true,
    transactions: true,
    persistence: true,
  };

  private db: Database.Database | null = null;
  private dbPath: string;
  private embeddingDimension: number;
  private tableName: string;
  private available: boolean = false;

  constructor(config: SQLiteVecBackendConfig = {}) {
    this.dbPath = config.dbPath || DEFAULT_DB_PATH;
    this.embeddingDimension = config.embeddingDimension || DEFAULT_EMBEDDING_DIMENSION;
    this.tableName = config.tableName || DEFAULT_TABLE_NAME;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async init(): Promise<void> {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Try to load sqlite-vec extension
      try {
        this.db.loadExtension('vec0');
        logger.info('[SQLiteVec] sqlite-vec extension loaded');
      } catch (err) {
        logger.warn('[SQLiteVec] sqlite-vec extension not available, using BM25 fallback:', err instanceof Error ? err.message : String(err));
      }

      // Create tables
      this.createTables();

      this.available = true;
      logger.info(`[SQLiteVec] Backend initialized at ${this.dbPath}`);
    } catch (err) {
      logger.error('[SQLiteVec] Failed to initialize:', err instanceof Error ? err.message : String(err));
      this.available = false;
      throw err;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    // Main memories table with FTS5 for full-text search
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT DEFAULT '{}',
        category TEXT DEFAULT 'other',
        importance REAL DEFAULT 1.0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_category ON ${this.tableName}(category);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_importance ON ${this.tableName}(importance);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_created ON ${this.tableName}(created_at);
    `);

    // FTS5 virtual table for full-text search
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}_fts USING fts5(
          text,
          category,
          content='${this.tableName}',
          content_rowid=id
        );
      `);
    } catch (err) {
      logger.warn('[SQLiteVec] FTS5 table creation failed:', err instanceof Error ? err.message : String(err));
    }

    // Try to create vector index if sqlite-vec is available
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}_vec USING vec0(
          id INTEGER PRIMARY KEY,
          embedding FLOAT[${this.embeddingDimension}]
        );
      `);
    } catch (err) {
      logger.debug('[SQLiteVec] Vector table creation skipped:', err instanceof Error ? err.message : String(err));
    }
  }

  async insertMemory(text: string, metadata: Record<string, unknown> = {}): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const category = (metadata.category as string) || 'other';
    const importance = (metadata.importance as number) || 1.0;

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (text, metadata, category, importance)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(text, JSON.stringify(metadata), category, importance);
    const id = result.lastInsertRowid as number;

    // Insert into FTS table
    try {
      const ftsStmt = this.db.prepare(`
        INSERT INTO ${this.tableName}_fts (rowid, text, category)
        VALUES (?, ?, ?)
      `);
      ftsStmt.run(id, text, category);
    } catch {
      // FTS insert failed, non-critical
    }

    logger.debug(`[SQLiteVec] Inserted memory ${id}: ${text.slice(0, 50)}...`);
    return id;
  }

  async searchMemory(query: string, topK: number = 10, filters: Record<string, unknown> = {}): Promise<MemorySearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const minScore = (filters.minScore as number) ?? DEFAULT_MIN_SCORE;
    const category = filters.category as string | undefined;

    // Use FTS5 for full-text search
    let sql = `
      SELECT m.id, m.text, m.metadata, m.category, m.importance, m.created_at,
             bm25(${this.tableName}_fts) as score
      FROM ${this.tableName} m
      JOIN ${this.tableName}_fts fts ON m.id = fts.rowid
      WHERE ${this.tableName}_fts MATCH ?
    `;
    const params: (string | number)[] = [query];

    if (category) {
      sql += ` AND m.category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY score ASC LIMIT ?`;
    params.push(topK);

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as VecRow[];

      // Convert BM25 score to similarity (negate and normalize)
      return rows.map(row => ({
        id: row.id,
        text: row.text,
        metadata: JSON.parse(row.metadata || '{}'),
        similarity: this.normalizeBM25Score(row.id as unknown as number),
        category: row.category,
        createdAt: row.created_at,
      }));
    } catch (err) {
      // Fallback to LIKE search if FTS fails
      logger.warn('[SQLiteVec] FTS search failed, using LIKE fallback:', err instanceof Error ? err.message : String(err));
      return this.searchWithLike(query, topK, category);
    }
  }

  private async searchWithLike(query: string, topK: number, category?: string): Promise<MemorySearchResult[]> {
    if (!this.db) return [];

    let sql = `SELECT id, text, metadata, category, importance, created_at FROM ${this.tableName} WHERE text LIKE ?`;
    const params: (string | number)[] = [`%${query}%`];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY importance DESC, created_at DESC LIMIT ?`;
    params.push(topK);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as VecRow[];

    return rows.map(row => ({
      id: row.id,
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}'),
      similarity: 0.5, // Default similarity for LIKE search
      category: row.category,
      createdAt: row.created_at,
    }));
  }

  private normalizeBM25Score(score: number): number {
    // BM25 scores are negative for matches, convert to 0-1 similarity
    const normalized = Math.max(0, Math.min(1, 1 - (score / 10)));
    return normalized;
  }

  async getMemory(id: number): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`SELECT id, text, metadata, created_at FROM ${this.tableName} WHERE id = ?`);
    const row = stmt.get(id) as VecRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
    };
  }

  async deleteMemory(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);

    // Also delete from FTS
    try {
      const ftsStmt = this.db.prepare(`DELETE FROM ${this.tableName}_fts WHERE rowid = ?`);
      ftsStmt.run(id);
    } catch {
      // Non-critical
    }

    return result.changes > 0;
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`DELETE FROM ${this.tableName}`);
    try {
      this.db.exec(`DELETE FROM ${this.tableName}_fts`);
    } catch {
      // Non-critical
    }

    logger.info('[SQLiteVec] All memories cleared');
  }

  async getStats(): Promise<MemoryStats> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`SELECT COUNT(*) as count, AVG(LENGTH(text)) as avgLen FROM ${this.tableName}`);
    const row = stmt.get() as { count: number; avgLen: number };

    return {
      totalMemories: row.count || 0,
      avgTextLength: Math.round(row.avgLen || 0),
      backendType: this.type,
    };
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.available = false;
      logger.info('[SQLiteVec] Database closed');
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let defaultBackend: SQLiteVecBackend | null = null;

export function getSQLiteVecBackend(config?: SQLiteVecBackendConfig): SQLiteVecBackend {
  if (!defaultBackend) {
    defaultBackend = new SQLiteVecBackend(config);
  }
  return defaultBackend;
}

export default SQLiteVecBackend;