import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import {
  resolveAgentDatabasePath,
  normalizeAgentId,
  getRelatedDatabaseFiles,
} from './db-paths.js';
import { SchemaManager, createAgentMigrations } from './schema-manager.js';
import { registerAgentDatabase } from './openclaw-state-db.js';
import type { AgentDatabaseOptions, OpenAgentDatabase } from './types.js';

const AGENT_DB_DIR_MODE = 0o700;
const AGENT_DB_FILE_MODE = 0o600;

const cachedDatabases = new Map<string, OpenAgentDatabase>();

function ensureAgentDatabasePermissions(
  pathname: string,
  options: AgentDatabaseOptions
): void {
  const dir = path.dirname(pathname);
  const dirExisted = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true, mode: AGENT_DB_DIR_MODE });
  if (!dirExisted) {
    try {
      fs.chmodSync(dir, AGENT_DB_DIR_MODE);
    } catch {
      logger.debug(`[AgentDB] Cannot chmod agent dir: ${dir}`);
    }
  }
  for (const candidate of getRelatedDatabaseFiles(pathname)) {
    if (fs.existsSync(candidate)) {
      try {
        fs.chmodSync(candidate, AGENT_DB_FILE_MODE);
      } catch {
        logger.debug(`[AgentDB] Cannot chmod ${candidate}`);
      }
    }
  }
}

function configureDatabasePragmas(db: Database.Database): void {
  db.pragma('busy_timeout = 30000');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
}

function assertValidAgentDatabase(
  db: Database.Database,
  agentId: string,
  pathname: string
): void {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'")
    .get() as { name: string } | undefined;
  if (!row) return;

  const metaRow = db
    .prepare("SELECT role, agent_id FROM schema_meta WHERE meta_key = 'primary'")
    .get() as { role?: string; agent_id?: string } | undefined;
  if (!metaRow) return;

  if (metaRow.role && metaRow.role !== 'agent') {
    throw new Error(
      `Agent database ${pathname} has schema role ${metaRow.role}; expected agent.`
    );
  }
  if (metaRow.agent_id && normalizeAgentId(metaRow.agent_id) !== agentId) {
    throw new Error(
      `Agent database ${pathname} belongs to agent ${metaRow.agent_id}; requested agent ${agentId}.`
    );
  }
}

export function openAgentDatabase(options: AgentDatabaseOptions): OpenAgentDatabase {
  const agentId = normalizeAgentId(options.agentId);
  const pathname = resolveAgentDatabasePath({ ...options, agentId });
  const cached = cachedDatabases.get(pathname);
  if (cached && cached.db.open) {
    if (cached.agentId !== agentId) {
      throw new Error(
        `Agent database ${pathname} is already open for agent ${cached.agentId}; requested agent ${agentId}.`
      );
    }
    registerAgentDatabase(agentId, pathname, cached.schemaVersion, options);
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

  ensureAgentDatabasePermissions(pathname, { ...options, agentId });

  const db = new Database(pathname);
  try {
    configureDatabasePragmas(db);

    assertValidAgentDatabase(db, agentId, pathname);

    const schemaManager = new SchemaManager(db, {
      migrations: createAgentMigrations(),
      role: 'agent',
      agentId,
    });

    const migrationResult = schemaManager.applyMigrations();
    if (!migrationResult.success) {
      throw new Error(
        `Agent database migration failed for ${agentId}: ${migrationResult.errors
          .map((e) => `v${e.version} ${e.name}: ${e.error}`)
          .join(', ')}`
      );
    }

    if (migrationResult.applied.length > 0) {
      logger.info(
        `[AgentDB] Applied ${migrationResult.applied.length} migration(s) for agent ${agentId}`,
        migrationResult.applied.map((m) => `v${m.version} ${m.name}`)
      );
    }

    const schemaVersion = schemaManager.getCurrentVersion();
    const result: OpenAgentDatabase = { db, path: pathname, schemaVersion, agentId };
    cachedDatabases.set(pathname, result);
    ensureAgentDatabasePermissions(pathname, { ...options, agentId });
    registerAgentDatabase(agentId, pathname, schemaVersion, options);
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

export function closeAgentDatabases(): void {
  for (const database of cachedDatabases.values()) {
    try {
      if (database.db.open) {
        database.db.pragma('wal_checkpoint(TRUNCATE)');
        database.db.close();
      }
    } catch (err) {
      logger.warn(`[AgentDB] Error closing agent DB for ${database.agentId}:`, err);
    }
  }
  cachedDatabases.clear();
}

export function runAgentWriteTransaction<T>(
  operation: (database: OpenAgentDatabase) => T,
  options: AgentDatabaseOptions
): T {
  const database = openAgentDatabase(options);
  const runTransaction = database.db.transaction(() => operation(database));
  const result = runTransaction();
  try {
    ensureAgentDatabasePermissions(database.path, options);
  } catch {
    // ignore
  }
  return result;
}

export function createAgentSession(
  options: AgentDatabaseOptions & {
    sessionId: string;
    sessionKey: string;
    title?: string;
    model?: string;
  }
): void {
  runAgentWriteTransaction(
    ({ db }) => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO agent_sessions (session_id, session_key, title, model, created_at, updated_at, last_active_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
      ).run(
        options.sessionId,
        options.sessionKey,
        options.title ?? null,
        options.model ?? null,
        now,
        now,
        now
      );
    },
    options
  );
}

export function getAgentSession(
  options: AgentDatabaseOptions & { sessionId: string }
): {
  sessionId: string;
  sessionKey: string;
  title: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number | null;
  status: string;
} | null {
  const { db } = openAgentDatabase(options);
  const row = db
    .prepare('SELECT * FROM agent_sessions WHERE session_id = ?')
    .get(options.sessionId) as
    | {
    session_id: string;
    session_key: string;
    title: string | null;
    model: string | null;
    created_at: number;
    updated_at: number;
    last_active_at: number | null;
    status: string;
  }
    | undefined;
  if (!row) return null;
  return {
    sessionId: row.session_id,
    sessionKey: row.session_key,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActiveAt: row.last_active_at,
    status: row.status,
  };
}

export function listAgentSessions(
  options: AgentDatabaseOptions & { limit?: number; status?: string }
): Array<{
  sessionId: string;
  sessionKey: string;
  title: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
  status: string;
}> {
  const { db } = openAgentDatabase(options);
  let sql = 'SELECT * FROM agent_sessions';
  const params: unknown[] = [];
  if (options.status) {
    sql += ' WHERE status = ?';
    params.push(options.status);
  }
  sql += ' ORDER BY updated_at DESC';
  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
  const rows = db.prepare(sql).all(...params) as Array<{
    session_id: string;
    session_key: string;
    title: string | null;
    model: string | null;
    created_at: number;
    updated_at: number;
    status: string;
  }>;
  return rows.map((row) => ({
    sessionId: row.session_id,
    sessionKey: row.session_key,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
  }));
}

export function addAgentMessage(
  options: AgentDatabaseOptions & {
    messageId: string;
    sessionId: string;
    role: string;
    content: string;
    model?: string;
    toolCalls?: unknown;
    thinking?: string;
    thinkingDurationMs?: number;
  }
): void {
  runAgentWriteTransaction(
    ({ db }) => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO agent_messages (message_id, session_id, role, content, model, timestamp, tool_calls_json, thinking, thinking_duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        options.messageId,
        options.sessionId,
        options.role,
        options.content,
        options.model ?? null,
        now,
        options.toolCalls ? JSON.stringify(options.toolCalls) : null,
        options.thinking ?? null,
        options.thinkingDurationMs ?? null
      );
      db.prepare(
        'UPDATE agent_sessions SET updated_at = ?, last_active_at = ? WHERE session_id = ?'
      ).run(now, now, options.sessionId);
    },
    options
  );
}

export function getAgentMessages(
  options: AgentDatabaseOptions & { sessionId: string; limit?: number }
): Array<{
  messageId: string;
  sessionId: string;
  role: string;
  content: string;
  model: string | null;
  timestamp: number;
  toolCalls: unknown | null;
  thinking: string | null;
  thinkingDurationMs: number | null;
}> {
  const { db } = openAgentDatabase(options);
  let sql: string;
  const params: unknown[] = [];
  if (options.limit) {
    sql = `
      SELECT * FROM (
        SELECT * FROM agent_messages
        WHERE session_id = ?
        ORDER BY timestamp DESC, message_id DESC
        LIMIT ?
      )
      ORDER BY timestamp ASC, message_id ASC
    `;
    params.push(options.sessionId, options.limit);
  } else {
    sql = 'SELECT * FROM agent_messages WHERE session_id = ? ORDER BY timestamp ASC, message_id ASC';
    params.push(options.sessionId);
  }
  const rows = db.prepare(sql).all(...params) as Array<{
    message_id: string;
    session_id: string;
    role: string;
    content: string;
    model: string | null;
    timestamp: number;
    tool_calls_json: string | null;
    thinking: string | null;
    thinking_duration_ms: number | null;
  }>;
  return rows.map((row) => ({
    messageId: row.message_id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    model: row.model,
    timestamp: row.timestamp,
    toolCalls: row.tool_calls_json ? JSON.parse(row.tool_calls_json) : null,
    thinking: row.thinking,
    thinkingDurationMs: row.thinking_duration_ms,
  }));
}

export function recordToolCall(
  options: AgentDatabaseOptions & {
    toolCallId: string;
    sessionId: string;
    messageId?: string;
    toolName: string;
    arguments?: unknown;
  }
): void {
  runAgentWriteTransaction(
    ({ db }) => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO agent_tool_calls (tool_call_id, session_id, message_id, tool_name, arguments_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      ).run(
        options.toolCallId,
        options.sessionId,
        options.messageId ?? null,
        options.toolName,
        options.arguments ? JSON.stringify(options.arguments) : null,
        now
      );
    },
    options
  );
}

export function completeToolCall(
  options: AgentDatabaseOptions & {
    toolCallId: string;
    result?: unknown;
    error?: string;
  }
): void {
  runAgentWriteTransaction(
    ({ db }) => {
      const now = Date.now();
      const row = db
        .prepare('SELECT created_at FROM agent_tool_calls WHERE tool_call_id = ?')
        .get(options.toolCallId) as { created_at: number } | undefined;
      const durationMs = row ? now - row.created_at : null;
      db.prepare(
        `UPDATE agent_tool_calls
         SET result_json = ?, error = ?, status = ?, completed_at = ?, duration_ms = ?
         WHERE tool_call_id = ?`
      ).run(
        options.result !== undefined ? JSON.stringify(options.result) : null,
        options.error ?? null,
        options.error ? 'failed' : 'completed',
        now,
        durationMs,
        options.toolCallId
      );
    },
    options
  );
}

export function setAgentCache(
  options: AgentDatabaseOptions & {
    scope: string;
    key: string;
    value: unknown;
    expiresAt?: number;
  }
): void {
  runAgentWriteTransaction(
    ({ db }) => {
      const now = Date.now();
      db.prepare(
        `INSERT OR REPLACE INTO cache_entries (scope, key, value_json, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        options.scope,
        options.key,
        JSON.stringify(options.value),
        options.expiresAt ?? null,
        now,
        now
      );
    },
    options
  );
}

export function getAgentCache<T = unknown>(
  options: AgentDatabaseOptions & { scope: string; key: string }
): { value: T; expiresAt: number | null } | null {
  const { db } = openAgentDatabase(options);
  const now = Date.now();
  const row = db
    .prepare(
      'SELECT value_json, expires_at FROM cache_entries WHERE scope = ? AND key = ? AND (expires_at IS NULL OR expires_at > ?)'
    )
    .get(options.scope, options.key, now) as
    | { value_json: string; expires_at: number | null }
    | undefined;
  if (!row) return null;
  return {
    value: JSON.parse(row.value_json) as T,
    expiresAt: row.expires_at,
  };
}

export function deleteAgentCache(
  options: AgentDatabaseOptions & { scope: string; key: string }
): boolean {
  return runAgentWriteTransaction(
    ({ db }) => {
      const info = db
        .prepare('DELETE FROM cache_entries WHERE scope = ? AND key = ?')
        .run(options.scope, options.key);
      return info.changes > 0;
    },
    options
  );
}

export const closeAgentDatabasesForTest = closeAgentDatabases;
