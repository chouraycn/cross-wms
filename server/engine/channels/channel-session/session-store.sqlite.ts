import Database from "better-sqlite3";
import { logger } from "../../../logger.js";
import type { ChannelSession } from "../session.js";
import type { SessionStore } from "./session-store.js";

export class SqliteSessionStore implements SessionStore {
  private db: Database.Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_sessions (
        session_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        target_id TEXT,
        user_id TEXT,
        start_time INTEGER NOT NULL,
        last_activity_time INTEGER NOT NULL,
        metadata TEXT,
        UNIQUE(session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_sessions_channel_id ON channel_sessions(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_sessions_user_id ON channel_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_channel_sessions_last_activity ON channel_sessions(last_activity_time);
    `);
  }

  async get(sessionId: string): Promise<ChannelSession | undefined> {
    const stmt = this.db.prepare(
      "SELECT * FROM channel_sessions WHERE session_id = ?"
    );
    const row = stmt.get(sessionId) as any;
    if (!row) return undefined;
    return this.rowToSession(row);
  }

  async set(session: ChannelSession): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO channel_sessions (
        session_id,
        channel_id,
        channel_type,
        target_id,
        user_id,
        start_time,
        last_activity_time,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.sessionId,
      session.channelId,
      session.channelType,
      session.targetId,
      session.userId,
      session.startTime,
      session.lastActivityTime,
      JSON.stringify(session.metadata ?? {})
    );
  }

  async delete(sessionId: string): Promise<boolean> {
    const stmt = this.db.prepare(
      "DELETE FROM channel_sessions WHERE session_id = ?"
    );
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  async list(): Promise<ChannelSession[]> {
    const stmt = this.db.prepare("SELECT * FROM channel_sessions");
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToSession(row));
  }

  async listByChannel(channelId: string): Promise<ChannelSession[]> {
    const stmt = this.db.prepare(
      "SELECT * FROM channel_sessions WHERE channel_id = ?"
    );
    const rows = stmt.all(channelId) as any[];
    return rows.map((row) => this.rowToSession(row));
  }

  async listByUserId(userId: string): Promise<ChannelSession[]> {
    const stmt = this.db.prepare(
      "SELECT * FROM channel_sessions WHERE user_id = ?"
    );
    const rows = stmt.all(userId) as any[];
    return rows.map((row) => this.rowToSession(row));
  }

  async clear(): Promise<void> {
    this.db.exec("DELETE FROM channel_sessions");
  }

  async getCount(): Promise<number> {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM channel_sessions");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async cleanupExpired(maxAgeMs: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeMs;
    const stmt = this.db.prepare(
      "DELETE FROM channel_sessions WHERE last_activity_time < ?"
    );
    const result = stmt.run(cutoffTime);
    logger.debug(`[ChannelSession:SQLite] Cleaned up ${result.changes} expired sessions`);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }

  private rowToSession(row: any): ChannelSession {
    return {
      sessionId: row.session_id,
      channelId: row.channel_id,
      channelType: row.channel_type,
      targetId: row.target_id,
      userId: row.user_id,
      startTime: row.start_time,
      lastActivityTime: row.last_activity_time,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    };
  }
}