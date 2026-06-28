/**
 * Inbound event queue implementation.
 *
 * Provides a SQLite-based FIFO queue for inbound events.
 */
import Database from "better-sqlite3";
import type { InboundEvent, InboundQueue } from "./types.js";

/**
 * SQLite implementation of the inbound event queue.
 * Uses a FIFO queue backed by SQLite for durability.
 */
export class SqliteInboundQueue implements InboundQueue {
  private db: Database.Database;
  private insertStmt!: Database.Statement;
  private selectStmt!: Database.Statement;
  private deleteStmt!: Database.Statement;
  private countStmt!: Database.Statement;
  private clearStmt!: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    this.prepareStatements();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inbound_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        enqueued_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbound_queue_enqueued_at
        ON inbound_queue(enqueued_at ASC);
    `);
  }

  private prepareStatements(): void {
    this.insertStmt = this.db.prepare(`
      INSERT INTO inbound_queue (event, enqueued_at) VALUES (?, ?)
    `);

    this.selectStmt = this.db.prepare(`
      SELECT id, event FROM inbound_queue
      ORDER BY enqueued_at ASC, id ASC
      LIMIT 1
    `);

    this.deleteStmt = this.db.prepare(`
      DELETE FROM inbound_queue WHERE id = ?
    `);

    this.countStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM inbound_queue
    `);

    this.clearStmt = this.db.prepare(`
      DELETE FROM inbound_queue
    `);
  }

  async enqueue(event: InboundEvent): Promise<void> {
    const eventJson = JSON.stringify(event);
    const enqueuedAt = Date.now();
    this.insertStmt.run(eventJson, enqueuedAt);
  }

  async dequeue(): Promise<InboundEvent | null> {
    const row = this.selectStmt.get() as { id: number; event: string } | undefined;
    if (!row) {
      return null;
    }

    try {
      const event = JSON.parse(row.event) as InboundEvent;
      this.deleteStmt.run(row.id);
      return event;
    } catch {
      // If parsing fails, delete the corrupted row and return null
      this.deleteStmt.run(row.id);
      return null;
    }
  }

  async size(): Promise<number> {
    const result = this.countStmt.get() as { count: number };
    return result.count;
  }

  async clear(): Promise<void> {
    this.clearStmt.run();
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Creates an in-memory inbound queue for testing purposes.
 */
export class InMemoryInboundQueue implements InboundQueue {
  private queue: Array<{ event: InboundEvent; enqueuedAt: number }> = [];

  async enqueue(event: InboundEvent): Promise<void> {
    this.queue.push({ event, enqueuedAt: Date.now() });
  }

  async dequeue(): Promise<InboundEvent | null> {
    const item = this.queue.shift();
    return item ? item.event : null;
  }

  async size(): Promise<number> {
    return this.queue.length;
  }

  async clear(): Promise<void> {
    this.queue = [];
  }
}
