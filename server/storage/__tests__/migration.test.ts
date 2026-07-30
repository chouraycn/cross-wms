// storage/migration unit tests cover v9 SQLite→JSONL session migration
// idempotency, including the missing-tables fallback path, app_settings
// marker insertion, and FileStorage.appendSessionLine invocation counts.
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

vi.mock('../FileStorage.js', () => ({
  FileStorage: {
    ensureDirectories: vi.fn(),
    appendSessionLine: vi.fn(),
  },
}));

import { migrateSessionsToJsonl } from '../migration.js';
import { FileStorage } from '../FileStorage.js';

const appendSessionLineMock = vi.mocked(FileStorage).appendSessionLine;
const ensureDirectoriesMock = vi.mocked(FileStorage).ensureDirectories;

// Helper: build an in-memory DB with sessions + messages tables.
function createDbWithSessionTables(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
      timestamp TEXT NOT NULL
    );
  `);
  return db;
}

function insertSession(db: Database.Database, id: string) {
  db.prepare(
    'INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
  ).run(id, `Session ${id}`, '2026-01-01 10:00:00', '2026-01-01 10:05:00');
}

function insertMessage(db: Database.Database, sessionId: string, msgId: string, role: string, content: string) {
  db.prepare(
    'INSERT INTO messages (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)',
  ).run(msgId, sessionId, role, content, '2026-01-01 10:01:00');
}

describe('storage/migration — migrateSessionsToJsonl', () => {
  beforeEach(() => {
    appendSessionLineMock.mockReset();
    ensureDirectoriesMock.mockReset();
  });

  it('skips migration when app_settings already marks it complete', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('v9_jsonl_migrated', '1')",
    ).run();

    migrateSessionsToJsonl(db);

    // FileStorage should never be called when already migrated
    expect(ensureDirectoriesMock).not.toHaveBeenCalled();
    expect(appendSessionLineMock).not.toHaveBeenCalled();
  });

  it('migrates sessions and messages to JSONL when not yet migrated', () => {
    const db = createDbWithSessionTables();
    insertSession(db, 'sess-1');
    insertSession(db, 'sess-2');
    insertMessage(db, 'sess-1', 'm1', 'user', 'hello');
    insertMessage(db, 'sess-1', 'm2', 'assistant', 'hi there');
    insertMessage(db, 'sess-2', 'm3', 'user', 'second session');

    migrateSessionsToJsonl(db);

    // ensureDirectories called once
    expect(ensureDirectoriesMock).toHaveBeenCalledTimes(1);
    // appendSessionLine called once per session
    expect(appendSessionLineMock).toHaveBeenCalledTimes(2);
    // Verify each call got session id + correct payload shape
    const firstCall = appendSessionLineMock.mock.calls[0];
    expect(firstCall[0]).toBe('sess-1');
    expect(firstCall[1]).toHaveProperty('session');
    expect(firstCall[1]).toHaveProperty('messages');
    expect(firstCall[1].messages.length).toBe(2);

    // Migration marker should be inserted
    const marker = db.prepare(
      "SELECT value FROM app_settings WHERE key = 'v9_jsonl_migrated'",
    ).get() as { value: string } | undefined;
    expect(marker).toBeDefined();
    expect(marker?.value).toBe('1');
  });

  it('marks migration as complete even when sessions table is missing', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    // No sessions table

    migrateSessionsToJsonl(db);

    // Should still mark migration complete
    const marker = db.prepare(
      "SELECT value FROM app_settings WHERE key = 'v9_jsonl_migrated'",
    ).get() as { value: string } | undefined;
    expect(marker).toBeDefined();
    expect(marker?.value).toBe('1');
    expect(appendSessionLineMock).not.toHaveBeenCalled();
  });

  it('creates app_settings table if missing', () => {
    const db = new Database(':memory:');
    // No tables at all

    migrateSessionsToJsonl(db);

    // app_settings should now exist (created via CREATE TABLE IF NOT EXISTS)
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'",
    ).all() as Array<{ name: string }>;
    expect(tables.length).toBe(1);
  });

  it('handles sessions table present but empty', () => {
    const db = createDbWithSessionTables();
    // No sessions inserted

    migrateSessionsToJsonl(db);

    expect(appendSessionLineMock).not.toHaveBeenCalled();
    // Migration should still be marked complete
    const marker = db.prepare(
      "SELECT value FROM app_settings WHERE key = 'v9_jsonl_migrated'",
    ).get() as { value: string } | undefined;
    expect(marker).toBeDefined();
  });

  it('preserves message order by timestamp ASC during migration', () => {
    const db = createDbWithSessionTables();
    insertSession(db, 'ordered');
    // Insert out of order
    insertMessage(db, 'ordered', 'late', 'user', 'later message');
    // Manually override timestamp for ordering test
    db.prepare('UPDATE messages SET timestamp = ? WHERE id = ?').run('2026-01-01 11:00:00', 'late');
    db.prepare(
      'INSERT INTO messages (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)',
    ).run('early', 'ordered', 'user', 'earlier message', '2026-01-01 09:00:00');

    migrateSessionsToJsonl(db);

    const call = appendSessionLineMock.mock.calls[0];
    const messages = call[1].messages;
    // Earlier message should come first
    expect(messages[0].id).toBe('early');
    expect(messages[1].id).toBe('late');
  });

  it('continues migrating remaining sessions if one fails', () => {
    const db = createDbWithSessionTables();
    insertSession(db, 'good-1');
    insertSession(db, 'bad'); // will trigger appendSessionLine failure
    insertSession(db, 'good-2');
    insertMessage(db, 'good-1', 'gm1', 'user', 'ok');
    insertMessage(db, 'bad', 'bm1', 'user', 'bad');
    insertMessage(db, 'good-2', 'gm2', 'user', 'ok');

    // Make the second call (for 'bad') throw
    appendSessionLineMock
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('disk full');
      })
      .mockImplementationOnce(() => {});

    migrateSessionsToJsonl(db);

    // Should have attempted all 3 sessions
    expect(appendSessionLineMock).toHaveBeenCalledTimes(3);
    // Migration marker should still be set even with partial failure
    const marker = db.prepare(
      "SELECT value FROM app_settings WHERE key = 'v9_jsonl_migrated'",
    ).get() as { value: string } | undefined;
    expect(marker).toBeDefined();
  });

  it('is idempotent: second call does nothing', () => {
    const db = createDbWithSessionTables();
    insertSession(db, 'sess-1');
    insertMessage(db, 'sess-1', 'm1', 'user', 'hello');

    migrateSessionsToJsonl(db);
    expect(appendSessionLineMock).toHaveBeenCalledTimes(1);

    // Second call should be a no-op
    migrateSessionsToJsonl(db);
    expect(appendSessionLineMock).toHaveBeenCalledTimes(1); // still 1
  });
});
