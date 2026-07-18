import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { logger } from '../../../../logger.js';
import type { TranscriptEntry, TranscriptSearchOptions, TranscriptSearchResult, TranscriptStats, TranscriptExportOptions } from './transcript-types.js';
import type { TranscriptMessage } from '../types.js';
import { generateSessionId } from '../session-key.js';

export class SQLiteTranscriptStore {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  init(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath, {
      verbose: (...args: unknown[]) => logger.debug('[SQLiteTranscript]', ...args),
    });

    this.createTables();
    this.ensureIndexes();
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transcript_entries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_id TEXT,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tool_calls TEXT,
        tool_result TEXT,
        attachments TEXT,
        generated_files TEXT,
        metadata TEXT,
        inserted_at TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transcript_metadata (
        session_id TEXT PRIMARY KEY,
        message_count INTEGER NOT NULL DEFAULT 0,
        last_updated TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const versionExists = this.db.prepare('SELECT 1 FROM schema_version WHERE version = ?').get('1.0.0');
    if (!versionExists) {
      this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        '1.0.0',
        new Date().toISOString()
      );
    }
  }

  private ensureIndexes(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transcript_session_id ON transcript_entries(session_id);
      CREATE INDEX IF NOT EXISTS idx_transcript_role ON transcript_entries(role);
      CREATE INDEX IF NOT EXISTS idx_transcript_timestamp ON transcript_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_transcript_inserted_at ON transcript_entries(inserted_at);
    `);
  }

  insertEntry(sessionId: string, message: TranscriptMessage): TranscriptEntry | null {
    if (!this.db) return null;

    const entryId = generateSessionId();
    const now = new Date().toISOString();
    const sizeBytes = Buffer.byteLength(JSON.stringify(message), 'utf-8');

    try {
      this.db.prepare(`
        INSERT INTO transcript_entries (
          id, session_id, message_id, role, content, timestamp,
          tool_calls, tool_result, attachments, generated_files,
          metadata, inserted_at, size_bytes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        sessionId,
        message.id || null,
        message.role,
        message.content,
        message.timestamp || now,
        message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        message.toolResult ? JSON.stringify(message.toolResult) : null,
        message.attachments ? JSON.stringify(message.attachments) : null,
        message.generatedFiles ? JSON.stringify(message.generatedFiles) : null,
        message.metadata ? JSON.stringify(message.metadata) : null,
        now,
        sizeBytes
      );

      this.updateSessionMetadata(sessionId);

      return {
        id: entryId,
        sessionId,
        messageId: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp || now,
        toolCalls: message.toolCalls,
        toolResult: message.toolResult,
        attachments: message.attachments,
        generatedFiles: message.generatedFiles,
        metadata: message.metadata || {},
        insertedAt: now,
      };
    } catch (err) {
      logger.error('[SQLiteTranscript] 插入条目失败:', sessionId, err);
      return null;
    }
  }

  insertEntries(sessionId: string, messages: TranscriptMessage[]): TranscriptEntry[] {
    if (!this.db || messages.length === 0) return [];

    const entries: TranscriptEntry[] = [];
    const now = new Date().toISOString();

    try {
      this.db.transaction(() => {
        for (const message of messages) {
          const entryId = generateSessionId();
          const sizeBytes = Buffer.byteLength(JSON.stringify(message), 'utf-8');

          this.db!.prepare(`
            INSERT INTO transcript_entries (
              id, session_id, message_id, role, content, timestamp,
              tool_calls, tool_result, attachments, generated_files,
              metadata, inserted_at, size_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            entryId,
            sessionId,
            message.id || null,
            message.role,
            message.content,
            message.timestamp || now,
            message.toolCalls ? JSON.stringify(message.toolCalls) : null,
            message.toolResult ? JSON.stringify(message.toolResult) : null,
            message.attachments ? JSON.stringify(message.attachments) : null,
            message.generatedFiles ? JSON.stringify(message.generatedFiles) : null,
            message.metadata ? JSON.stringify(message.metadata) : null,
            now,
            sizeBytes
          );

          entries.push({
            id: entryId,
            sessionId,
            messageId: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp || now,
            toolCalls: message.toolCalls,
            toolResult: message.toolResult,
            attachments: message.attachments,
            generatedFiles: message.generatedFiles,
            metadata: message.metadata || {},
            insertedAt: now,
          });
        }
      })();

      this.updateSessionMetadata(sessionId);
    } catch (err) {
      logger.error('[SQLiteTranscript] 批量插入失败:', sessionId, err);
    }

    return entries;
  }

  getEntries(sessionId: string, limit: number = 50, offset: number = 0): TranscriptEntry[] {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT * FROM transcript_entries
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
      `).all(sessionId, limit, offset);

      return (rows as unknown[]).map((row) => this.rowToEntry(row as Record<string, unknown>));
    } catch (err) {
      logger.error('[SQLiteTranscript] 查询条目失败:', sessionId, err);
      return [];
    }
  }

  getEntry(entryId: string): TranscriptEntry | null {
    if (!this.db) return null;

    try {
      const row = this.db.prepare('SELECT * FROM transcript_entries WHERE id = ?').get(entryId);
      return row ? this.rowToEntry(row as Record<string, unknown>) : null;
    } catch (err) {
      logger.error('[SQLiteTranscript] 查询单条失败:', entryId, err);
      return null;
    }
  }

  updateEntry(entryId: string, updates: Partial<TranscriptEntry>): boolean {
    if (!this.db) return false;

    try {
      const setClause = Object.entries(updates)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => `${this.snakeCase(k)} = ?`)
        .join(', ');

      if (!setClause) return false;

      const values = Object.values(updates).filter(v => v !== undefined);
      values.push(entryId);

      this.db.prepare(`UPDATE transcript_entries SET ${setClause} WHERE id = ?`).run(...values);

      if (updates.sessionId) {
        this.updateSessionMetadata(updates.sessionId);
      }

      return true;
    } catch (err) {
      logger.error('[SQLiteTranscript] 更新条目失败:', entryId, err);
      return false;
    }
  }

  deleteEntry(entryId: string): boolean {
    if (!this.db) return false;

    try {
      const entry = this.getEntry(entryId);
      if (entry) {
        this.db.prepare('DELETE FROM transcript_entries WHERE id = ?').run(entryId);
        this.updateSessionMetadata(entry.sessionId);
      }
      return true;
    } catch (err) {
      logger.error('[SQLiteTranscript] 删除条目失败:', entryId, err);
      return false;
    }
  }

  deleteEntries(sessionId: string): boolean {
    if (!this.db) return false;

    try {
      this.db.prepare('DELETE FROM transcript_entries WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM transcript_metadata WHERE session_id = ?').run(sessionId);
      return true;
    } catch (err) {
      logger.error('[SQLiteTranscript] 删除会话条目失败:', sessionId, err);
      return false;
    }
  }

  search(options: TranscriptSearchOptions): TranscriptSearchResult {
    if (!this.db) return { entries: [], total: 0, hasMore: false };

    try {
      let query = 'SELECT * FROM transcript_entries WHERE 1 = 1';
      const params: unknown[] = [];

      if (options.sessionId) {
        query += ' AND session_id = ?';
        params.push(options.sessionId);
      }

      if (options.role) {
        query += ' AND role = ?';
        params.push(options.role);
      }

      if (options.dateFrom) {
        query += ' AND timestamp >= ?';
        params.push(options.dateFrom);
      }

      if (options.dateTo) {
        query += ' AND timestamp <= ?';
        params.push(options.dateTo);
      }

      if (options.query) {
        query += ' AND content LIKE ?';
        params.push(`%${options.query}%`);
      }

      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
      const countRow = this.db.prepare(countQuery).get(...params) as { count: number };
      const total = countRow?.count || 0;

      const limit = options.limit || 50;
      const offset = options.offset || 0;

      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = this.db.prepare(query).all(...params);

      return {
        entries: (rows as unknown[]).map((row) => this.rowToEntry(row as Record<string, unknown>)),
        total,
        hasMore: offset + limit < total,
      };
    } catch (err) {
      logger.error('[SQLiteTranscript] 搜索失败:', options, err);
      return { entries: [], total: 0, hasMore: false };
    }
  }

  getStats(sessionId?: string): TranscriptStats {
    if (!this.db) return this.emptyStats();

    try {
      let query = `
        SELECT
          COUNT(*) as total_messages,
          COUNT(DISTINCT session_id) as total_sessions,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
          SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_messages,
          SUM(CASE WHEN role = 'system' THEN 1 ELSE 0 END) as system_messages,
          SUM(CASE WHEN role = 'tool' THEN 1 ELSE 0 END) as tool_messages,
          COALESCE(SUM(size_bytes), 0) as total_size_bytes
        FROM transcript_entries
      `;

      const params: unknown[] = [];

      if (sessionId) {
        query += ' WHERE session_id = ?';
        params.push(sessionId);
      }

      const row = this.db.prepare(query).get(...params) as Record<string, number>;

      return {
        totalMessages: row.total_messages || 0,
        totalSessions: sessionId ? 1 : (row.total_sessions || 0),
        userMessages: row.user_messages || 0,
        assistantMessages: row.assistant_messages || 0,
        systemMessages: row.system_messages || 0,
        toolMessages: row.tool_messages || 0,
        totalSizeBytes: row.total_size_bytes || 0,
      };
    } catch (err) {
      logger.error('[SQLiteTranscript] 获取统计失败:', sessionId, err);
      return this.emptyStats();
    }
  }

  export(options: TranscriptExportOptions): string {
    if (!this.db) return '';

    try {
      let query = 'SELECT * FROM transcript_entries';
      const params: unknown[] = [];

      if (options.sessionIds?.length) {
        query += ` WHERE session_id IN (${options.sessionIds.map(() => '?').join(', ')})`;
        params.push(...options.sessionIds);
      }

      if (options.dateFrom) {
        query += options.sessionIds?.length ? ' AND' : ' WHERE';
        query += ' timestamp >= ?';
        params.push(options.dateFrom);
      }

      if (options.dateTo) {
        query += options.sessionIds?.length || options.dateFrom ? ' AND' : ' WHERE';
        query += ' timestamp <= ?';
        params.push(options.dateTo);
      }

      query += ' ORDER BY session_id, timestamp ASC';

      const rows = this.db.prepare(query).all(...params);
      const entries = (rows as unknown[]).map((row) => this.rowToEntry(row as Record<string, unknown>));

      if (options.format === 'jsonl') {
        return entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      } else if (options.format === 'json') {
        return JSON.stringify({ entries }, null, 2);
      } else {
        return entries.map(e => {
          const ts = e.timestamp || '';
          return `## ${e.role.toUpperCase()} (${ts})\n\n${e.content}\n`;
        }).join('\n');
      }
    } catch (err) {
      logger.error('[SQLiteTranscript] 导出失败:', options, err);
      return '';
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('[SQLiteTranscript] 数据库已关闭');
    }
  }

  private updateSessionMetadata(sessionId: string): void {
    if (!this.db) return;

    const now = new Date().toISOString();

    const existing = this.db.prepare('SELECT 1 FROM transcript_metadata WHERE session_id = ?').get(sessionId);

    if (existing) {
      const count = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM transcript_entries WHERE session_id = ?'
      ).get(sessionId) as { cnt: number };

      this.db.prepare(`
        UPDATE transcript_metadata
        SET message_count = ?, last_updated = ?
        WHERE session_id = ?
      `).run(count.cnt || 0, now, sessionId);
    } else {
      this.db.prepare(`
        INSERT INTO transcript_metadata (session_id, message_count, last_updated, created_at)
        VALUES (?, 0, ?, ?)
      `).run(sessionId, now, now);
    }
  }

  private rowToEntry(row: Record<string, unknown>): TranscriptEntry {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      messageId: row.message_id ? String(row.message_id) : undefined,
      role: row.role as TranscriptEntry['role'],
      content: String(row.content),
      timestamp: String(row.timestamp),
      toolCalls: row.tool_calls ? JSON.parse(String(row.tool_calls)) : undefined,
      toolResult: row.tool_result ? JSON.parse(String(row.tool_result)) : undefined,
      attachments: row.attachments ? JSON.parse(String(row.attachments)) : undefined,
      generatedFiles: row.generated_files ? JSON.parse(String(row.generated_files)) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
      insertedAt: String(row.inserted_at),
    };
  }

  private snakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private emptyStats(): TranscriptStats {
    return {
      totalMessages: 0,
      totalSessions: 0,
      userMessages: 0,
      assistantMessages: 0,
      systemMessages: 0,
      toolMessages: 0,
      totalSizeBytes: 0,
    };
  }
}