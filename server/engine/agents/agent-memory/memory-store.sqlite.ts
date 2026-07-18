import BetterSqlite3 from 'better-sqlite3';
import { logger } from '../../../logger.js';
import type { MemoryEntry, MemoryStoreConfig, MemoryRetrievalOptions } from './types.js';
import { MemoryEntrySchema } from './types.js';
import { BaseMemoryStore } from './memory-store.js';

export class SqliteMemoryStore extends BaseMemoryStore {
  private db?: BetterSqlite3.Database;

  constructor(config: MemoryStoreConfig) {
    super(config);
  }

  async init(): Promise<void> {
    const path = this.config.path ?? ':memory:';
    this.db = new BetterSqlite3(path);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        relevance_score REAL DEFAULT 0,
        tags TEXT DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_memory_agent_id ON memory_entries(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memory_session_id ON memory_entries(session_id);
      CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
      CREATE INDEX IF NOT EXISTS idx_memory_expires_at ON memory_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_memory_relevance ON memory_entries(relevance_score);
    `);

    logger.debug(`[Agents:SqliteMemoryStore] Initialized at ${path}`);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      logger.debug('[Agents:SqliteMemoryStore] Closed');
    }
  }

  async add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    if (!this.db) throw new Error('Store not initialized');

    const now = Date.now();
    const id = this.generateId();

    const fullEntry: MemoryEntry = MemoryEntrySchema.parse({
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
    });

    this.db.prepare(
      `INSERT INTO memory_entries 
       (id, agent_id, session_id, type, content, metadata, created_at, updated_at, expires_at, relevance_score, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      fullEntry.id,
      fullEntry.agentId,
      fullEntry.sessionId,
      fullEntry.type,
      fullEntry.content,
      JSON.stringify(fullEntry.metadata),
      fullEntry.createdAt,
      fullEntry.updatedAt,
      fullEntry.expiresAt,
      fullEntry.relevanceScore,
      JSON.stringify(fullEntry.tags),
    );

    logger.debug(`[Agents:SqliteMemoryStore] Added entry: ${id}`);
    return fullEntry;
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    if (!this.db) throw new Error('Store not initialized');

    const row = this.db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id);
    if (!row) return undefined;

    return this.rowToEntry(row);
  }

  async update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'tags' | 'relevanceScore' | 'expiresAt'>>): Promise<MemoryEntry | undefined> {
    if (!this.db) throw new Error('Store not initialized');

    const existing = await this.get(id);
    if (!existing) return undefined;

    const now = Date.now();
    const updated: MemoryEntry = MemoryEntrySchema.parse({
      ...existing,
      ...updates,
      updatedAt: now,
    });

    this.db.prepare(
      `UPDATE memory_entries 
       SET content = ?, metadata = ?, tags = ?, relevance_score = ?, expires_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      updated.content,
      JSON.stringify(updated.metadata),
      JSON.stringify(updated.tags),
      updated.relevanceScore,
      updated.expiresAt,
      updated.updatedAt,
      id,
    );

    logger.debug(`[Agents:SqliteMemoryStore] Updated entry: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Store not initialized');

    const result = this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
    const deleted = result.changes > 0;

    if (deleted) {
      logger.debug(`[Agents:SqliteMemoryStore] Deleted entry: ${id}`);
    }

    return deleted;
  }

  async retrieve(options: MemoryRetrievalOptions): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Store not initialized');

    let query = 'SELECT * FROM memory_entries WHERE 1=1';
    const params: unknown[] = [];

    if (options.agentId) {
      query += ' AND agent_id = ?';
      params.push(options.agentId);
    }

    if (options.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options.tags && options.tags.length > 0) {
      query += ' AND (';
      options.tags.forEach((tag, i) => {
        if (i > 0) query += ' OR ';
        query += 'tags LIKE ?';
        params.push(`%"${tag}"%`);
      });
      query += ')';
    }

    if (options.minRelevance !== undefined) {
      query += ' AND relevance_score >= ?';
      params.push(options.minRelevance);
    }

    query += ' ORDER BY relevance_score DESC, created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as unknown[];
    return rows.map(row => this.rowToEntry(row));
  }

  async getByAgent(agentId: string): Promise<MemoryEntry[]> {
    return this.retrieve({ agentId });
  }

  async getBySession(sessionId: string): Promise<MemoryEntry[]> {
    return this.retrieve({ agentId: '', sessionId });
  }

  async count(options?: { agentId?: string; sessionId?: string; type?: MemoryEntry['type'] }): Promise<number> {
    if (!this.db) throw new Error('Store not initialized');

    let query = 'SELECT COUNT(*) as count FROM memory_entries WHERE 1=1';
    const params: unknown[] = [];

    if (options?.agentId) {
      query += ' AND agent_id = ?';
      params.push(options.agentId);
    }

    if (options?.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }

    if (options?.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count ?? 0;
  }

  async clear(options?: { agentId?: string; sessionId?: string }): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');

    let query = 'DELETE FROM memory_entries WHERE 1=1';
    const params: unknown[] = [];

    if (options?.agentId) {
      query += ' AND agent_id = ?';
      params.push(options.agentId);
    }

    if (options?.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }

    this.db.prepare(query).run(...params);
    logger.debug(`[Agents:SqliteMemoryStore] Cleared entries${options?.agentId ? ` for agent ${options.agentId}` : ''}`);
  }

  private rowToEntry(row: unknown): MemoryEntry {
    const r = row as Record<string, unknown>;
    return MemoryEntrySchema.parse({
      id: r.id as string,
      agentId: r.agent_id as string,
      sessionId: r.session_id as string,
      type: r.type as MemoryEntry['type'],
      content: r.content as string,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : {},
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      expiresAt: r.expires_at as number | undefined,
      relevanceScore: r.relevance_score as number,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : [],
    });
  }
}

logger.debug('[Agents:SqliteMemoryStore] Module loaded');
