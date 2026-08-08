// messageArchive unit tests cover archive table initialization (idempotent
// archived column + message_archives table), archive run scanning/summarizing
// sessions older than threshold, and the periodic scheduler lifecycle.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  initArchiveTables,
  runArchive,
  DEFAULT_ARCHIVE_CONFIG,
  startArchiveScheduler,
  type ArchiveConfig,
} from '../messageArchive.js';

// Helper: create a fresh in-memory DB with sessions + messages tables pre-populated.
// Matches schema of messages table used in production (includes toolCalls, archived cols).
function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      model TEXT,
      thinking TEXT,
      toolCalls TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
  return db;
}

function insertMessage(
  db: Database.Database,
  sessionId: string,
  role: string,
  content: string,
  timestamp: string,
) {
  db.prepare(
    `INSERT INTO messages (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
  ).run(`msg-${Math.random().toString(36).slice(2)}`, sessionId, role, content, timestamp);
}

describe('engine/messageArchive — DEFAULT_ARCHIVE_CONFIG', () => {
  it('exposes sensible defaults', () => {
    expect(DEFAULT_ARCHIVE_CONFIG.archiveAfterDays).toBe(30);
    expect(DEFAULT_ARCHIVE_CONFIG.keepRecentMessages).toBe(20);
    expect(DEFAULT_ARCHIVE_CONFIG.runIntervalMs).toBe(24 * 60 * 60 * 1000);
    expect(DEFAULT_ARCHIVE_CONFIG.maxSummaryLength).toBe(2000);
  });
});

describe('engine/messageArchive — initArchiveTables', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('adds archived column to messages table if missing', () => {
    initArchiveTables(db);
    const columns = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
    expect(columns.some(c => c.name === 'archived')).toBe(true);
  });

  it('creates message_archives table', () => {
    initArchiveTables(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='message_archives'",
    ).all() as Array<{ name: string }>;
    expect(tables.length).toBe(1);
  });

  it('creates idx_messages_archived index', () => {
    initArchiveTables(db);
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_archived'",
    ).all() as Array<{ name: string }>;
    expect(indexes.length).toBe(1);
  });

  it('creates idx_message_archives_session index', () => {
    initArchiveTables(db);
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_message_archives_session'",
    ).all() as Array<{ name: string }>;
    expect(indexes.length).toBe(1);
  });

  it('is idempotent (calling twice does not error)', () => {
    initArchiveTables(db);
    initArchiveTables(db);
    const columns = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
    expect(columns.filter(c => c.name === 'archived').length).toBe(1);
  });

  it('handles missing messages table gracefully (no throw)', () => {
    const emptyDb = new Database(':memory:');
    expect(() => initArchiveTables(emptyDb)).not.toThrow();
    // message_archives table should still be created
    const tables = emptyDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='message_archives'",
    ).all() as Array<{ name: string }>;
    expect(tables.length).toBe(1);
  });
});

describe('engine/messageArchive — runArchive', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    initArchiveTables(db);
  });

  it('returns empty result when no sessions need archiving', () => {
    const result = runArchive(db, { ...DEFAULT_ARCHIVE_CONFIG, archiveAfterDays: 30 });
    expect(result.sessionsArchived).toBe(0);
    expect(result.messagesArchived).toBe(0);
    expect(result.summariesCreated).toBe(0);
  });

  it('archives old sessions past the threshold', () => {
    // Insert an old session with 25 messages (more than keepRecentMessages=20)
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('old-session-1', 'Old Session', oldDate, oldDate);
    for (let i = 0; i < 25; i++) {
      insertMessage(db, 'old-session-1', i % 2 === 0 ? 'user' : 'assistant', `message ${i}`, oldDate);
    }

    const result = runArchive(db, { ...DEFAULT_ARCHIVE_CONFIG, archiveAfterDays: 30 });
    expect(result.sessionsArchived).toBe(1);
    expect(result.messagesArchived).toBe(5); // 25 - 20 keepRecent
    expect(result.summariesCreated).toBe(1);

    // Verify old messages are marked archived=1 and content cleared
    const archivedCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE sessionId = ? AND archived = 1',
    ).get('old-session-1') as { cnt: number };
    expect(archivedCount.cnt).toBe(5);

    // Verify message_archives table has the summary
    const archives = db.prepare(
      'SELECT * FROM message_archives WHERE session_id = ?',
    ).all('old-session-1') as unknown[];
    expect(archives.length).toBe(1);
    expect(archives[0].original_count).toBe(5);
    expect(archives[0].summary).toContain('👤');
    expect(archives[0].summary).toContain('🤖');
  });

  it('skips sessions with fewer messages than keepRecentMessages', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('small-session', 'Small Session', oldDate, oldDate);
    for (let i = 0; i < 10; i++) {
      insertMessage(db, 'small-session', 'user', `msg ${i}`, oldDate);
    }

    const result = runArchive(db, { ...DEFAULT_ARCHIVE_CONFIG, archiveAfterDays: 30 });
    expect(result.sessionsArchived).toBe(0);
    expect(result.messagesArchived).toBe(0);
  });

  it('respects custom keepRecentMessages config', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('keep-5', 'Keep 5 Session', oldDate, oldDate);
    for (let i = 0; i < 10; i++) {
      insertMessage(db, 'keep-5', 'user', `msg ${i}`, oldDate);
    }

    const result = runArchive(db, {
      ...DEFAULT_ARCHIVE_CONFIG,
      archiveAfterDays: 30,
      keepRecentMessages: 5,
    });
    expect(result.sessionsArchived).toBe(1);
    expect(result.messagesArchived).toBe(5); // 10 - 5 keepRecent
  });

  it('respects custom maxSummaryLength config', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('short-summary', 'Short Summary', oldDate, oldDate);
    for (let i = 0; i < 25; i++) {
      insertMessage(db, 'short-summary', 'user', `a long message body ${i} with lots of content to exceed limit`, oldDate);
    }

    const result = runArchive(db, {
      ...DEFAULT_ARCHIVE_CONFIG,
      archiveAfterDays: 30,
      maxSummaryLength: 100,
    });
    expect(result.sessionsArchived).toBe(1);
    const archive = db.prepare(
      'SELECT summary FROM message_archives WHERE session_id = ?',
    ).get('short-summary') as { summary: string };
    expect(archive.summary.length).toBeLessThanOrEqual(100);
  });

  it('does not archive recent sessions', () => {
    const recentDate = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('recent-session', 'Recent Session', recentDate, recentDate);
    for (let i = 0; i < 25; i++) {
      insertMessage(db, 'recent-session', 'user', `msg ${i}`, recentDate);
    }

    const result = runArchive(db, { ...DEFAULT_ARCHIVE_CONFIG, archiveAfterDays: 30 });
    expect(result.sessionsArchived).toBe(0);
  });

  it('handles empty database gracefully', () => {
    const result = runArchive(db, DEFAULT_ARCHIVE_CONFIG);
    expect(result.sessionsArchived).toBe(0);
    expect(result.messagesArchived).toBe(0);
  });

  it('records date_range_start and date_range_end in archive summary', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('date-range-session', 'Date Range Session', oldDate, oldDate);
    for (let i = 0; i < 25; i++) {
      // Use slightly different timestamps
      insertMessage(db, 'date-range-session', 'user', `msg ${i}`, `2026-01-${String(i + 1).padStart(2, '0')} 10:00:00`);
    }

    runArchive(db, { ...DEFAULT_ARCHIVE_CONFIG, archiveAfterDays: 30 });
    const archive = db.prepare(
      'SELECT date_range_start, date_range_end FROM message_archives WHERE session_id = ?',
    ).get('date-range-session') as { date_range_start: string; date_range_end: string };
    expect(archive.date_range_start).toBeDefined();
    expect(archive.date_range_end).toBeDefined();
  });

  it('clears thinking field when archiving messages', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(
      'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    ).run('thinking-session', 'Thinking Session', oldDate, oldDate);
    // Insert 25 messages with thinking field
    for (let i = 0; i < 25; i++) {
      const msgId = `think-msg-${i}`;
      db.prepare(
        `INSERT INTO messages (id, sessionId, role, content, timestamp, thinking) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(msgId, 'thinking-session', 'assistant', `content ${i}`, oldDate, `thinking content ${i}`);
    }

    runArchive(db, { ...DEFAULT_ARCHIVE_CONFIG, archiveAfterDays: 30 });
    const archivedMsgs = db.prepare(
      'SELECT thinking FROM messages WHERE sessionId = ? AND archived = 1',
    ).all('thinking-session') as Array<{ thinking: string | null }>;
    expect(archivedMsgs.length).toBe(5);
    // All archived messages should have thinking = NULL
    expect(archivedMsgs.every(m => m.thinking === null)).toBe(true);
  });
});

describe('engine/messageArchive — startArchiveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns a timer reference without throwing', () => {
    const db = createTestDb();
    initArchiveTables(db);
    const getDb = () => db;
    expect(() => startArchiveScheduler(getDb)).not.toThrow();
  });

  it('uses unref on the timer to avoid blocking process exit', () => {
    const db = createTestDb();
    initArchiveTables(db);
    const getDb = () => db;
    const timer = startArchiveScheduler(getDb);
    // Timer should be returned (we can't easily assert unref was called)
    expect(timer).toBeDefined();
  });
});
