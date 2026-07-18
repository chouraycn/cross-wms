import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import {
  resolveStateDatabasePath,
  resolveAgentDatabasePath,
  resolveStateDatabaseDir,
  resolveAgentDatabaseDir,
  normalizeAgentId,
  getRelatedDatabaseFiles,
  collectSchemaShape,
  tableExists,
  tableHasColumn,
  tablePrimaryKeyColumns,
  ensureColumn,
  SchemaManager,
  createStateMigrations,
  createAgentMigrations,
  explainQueryPlan,
  analyzeQueryPlan,
  planUsesIndex,
  planIncludesDetail,
  PermissionManager,
  PermissionError,
  createReaderRole,
  createWriterRole,
  createScopedRole,
  openStateDatabase,
  closeStateDatabaseForTest,
  setStateConfig,
  getStateConfig,
  setStateCache,
  getStateCache,
  deleteStateCache,
  cleanupExpiredCache,
  enqueueItem,
  dequeueItem,
  completeQueueItem,
  failQueueItem,
  getQueueStats,
  openAgentDatabase,
  closeAgentDatabasesForTest,
  createAgentSession,
  getAgentSession,
  listAgentSessions,
  addAgentMessage,
  getAgentMessages,
  recordToolCall,
  completeToolCall,
  setAgentCache,
  getAgentCache,
  deleteAgentCache,
} from '../index.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crosswms-state-test-'));
}

function createTestEnv(tempDir: string): NodeJS.ProcessEnv {
  return { ...process.env, CROSSWMS_STATE_DIR: tempDir };
}

afterEach(() => {
  closeStateDatabaseForTest();
  closeAgentDatabasesForTest();
});

describe('db-paths', () => {
  it('resolves state database path from env', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const dbPath = resolveStateDatabasePath({ env });
    expect(dbPath).toBe(path.join(tempDir, 'state', 'state.sqlite'));
  });

  it('resolves state database dir from env', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const dir = resolveStateDatabaseDir(env);
    expect(dir).toBe(path.join(tempDir, 'state'));
  });

  it('resolves agent database path from env', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const dbPath = resolveAgentDatabasePath({ agentId: 'test-agent', env });
    expect(dbPath).toBe(path.join(tempDir, 'agents', 'test-agent', 'agent.sqlite'));
  });

  it('resolves agent database dir from env', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const dir = resolveAgentDatabaseDir('test-agent', env);
    expect(dir).toBe(path.join(tempDir, 'agents', 'test-agent'));
  });

  it('normalizes agent ids', () => {
    expect(normalizeAgentId('Test Agent!')).toBe('test-agent');
    expect(normalizeAgentId('  MyAgent  ')).toBe('myagent');
    expect(normalizeAgentId('agent_123')).toBe('agent_123');
  });

  it('resolves custom path', () => {
    const customPath = '/custom/path/db.sqlite';
    const result = resolveStateDatabasePath({ path: customPath });
    expect(result).toBe(path.resolve(customPath));
  });

  it('returns related database files', () => {
    const files = getRelatedDatabaseFiles('/tmp/test.sqlite');
    expect(files).toContain('/tmp/test.sqlite');
    expect(files).toContain('/tmp/test.sqlite-wal');
    expect(files).toContain('/tmp/test.sqlite-shm');
    expect(files).toContain('/tmp/test.sqlite-journal');
  });
});

describe('sqlite-schema-shape', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at INTEGER
      );
      CREATE INDEX idx_users_name ON users(name);
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('checks if table exists', () => {
    expect(tableExists(db, 'users')).toBe(true);
    expect(tableExists(db, 'nonexistent')).toBe(false);
  });

  it('checks if table has column', () => {
    expect(tableHasColumn(db, 'users', 'name')).toBe(true);
    expect(tableHasColumn(db, 'users', 'nonexistent')).toBe(false);
    expect(tableHasColumn(db, 'nonexistent', 'id')).toBe(false);
  });

  it('gets primary key columns', () => {
    const pk = tablePrimaryKeyColumns(db, 'users');
    expect(pk).toEqual(['id']);
  });

  it('collects schema shape', () => {
    const shape = collectSchemaShape(db);
    expect(shape.tables['users']).toBeDefined();
    expect(shape.tables['users'].columns.length).toBe(4);
    expect(shape.tables['users'].indexes.length).toBeGreaterThan(0);
  });

  it('adds column with ensureColumn', () => {
    const added = ensureColumn(db, 'users', 'age INTEGER');
    expect(added).toBe(true);
    expect(tableHasColumn(db, 'users', 'age')).toBe(true);

    const addedAgain = ensureColumn(db, 'users', 'age INTEGER');
    expect(addedAgain).toBe(false);
  });

  it('does not add column to non-existent table', () => {
    const added = ensureColumn(db, 'nonexistent', 'col TEXT');
    expect(added).toBe(false);
  });
});

describe('schema-manager', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('initializes with version 0', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });
    expect(manager.getCurrentVersion()).toBe(0);
  });

  it('applies all pending migrations', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });
    const result = manager.applyMigrations();
    expect(result.success).toBe(true);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
    expect(manager.getCurrentVersion()).toBeGreaterThan(0);
  });

  it('does not re-apply migrations', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });
    manager.applyMigrations();
    const v1 = manager.getCurrentVersion();
    const result = manager.applyMigrations();
    expect(result.applied.length).toBe(0);
    expect(manager.getCurrentVersion()).toBe(v1);
  });

  it('detects pending migrations', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });
    expect(manager.needsMigration()).toBe(true);
    const pending = manager.getPendingMigrations();
    expect(pending.length).toBeGreaterThan(0);
  });

  it('records migration history', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });
    manager.applyMigrations();
    const history = manager.getMigrationHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h) => h.status === 'success')).toBe(true);
  });

  it('gets schema meta', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'agent',
      agentId: 'test-agent',
    });
    manager.applyMigrations();
    const meta = manager.getSchemaMeta();
    expect(meta).not.toBeNull();
    expect(meta?.role).toBe('agent');
    expect(meta?.agentId).toBe('test-agent');
  });

  it('initializes from schema SQL', () => {
    const manager = new SchemaManager(db, {
      migrations: [],
      role: 'global',
    });
    const schemaSql = `
      CREATE TABLE test_table (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;
    const initialized = manager.initializeSchema(schemaSql, 5);
    expect(initialized).toBe(true);
    expect(manager.getCurrentVersion()).toBe(5);
    expect(tableExists(db, 'test_table')).toBe(true);
  });

  it('ensures additive migrations', () => {
    const manager = new SchemaManager(db, {
      migrations: createStateMigrations(),
      role: 'global',
    });
    manager.applyMigrations();
    const added = manager.ensureAdditiveMigrations([
      { table: 'state_config', columns: ['extra_column TEXT'] },
    ]);
    expect(added).toBe(1);
    expect(tableHasColumn(db, 'state_config', 'extra_column')).toBe(true);
  });

  it('handles agent migrations', () => {
    const manager = new SchemaManager(db, {
      migrations: createAgentMigrations(),
      role: 'agent',
      agentId: 'test',
    });
    const result = manager.applyMigrations();
    expect(result.success).toBe(true);
    expect(tableExists(db, 'agent_sessions')).toBe(true);
    expect(tableExists(db, 'agent_messages')).toBe(true);
    expect(tableExists(db, 'agent_tool_calls')).toBe(true);
    expect(tableExists(db, 'cache_entries')).toBe(true);
  });
});

describe('sqlite-query-plan', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at INTEGER
      );
      CREATE INDEX idx_users_name ON users(name);
      CREATE INDEX idx_users_email ON users(email);
      INSERT INTO users (id, name, email, created_at) VALUES (1, 'Alice', 'alice@test.com', 1000);
      INSERT INTO users (id, name, email, created_at) VALUES (2, 'Bob', 'bob@test.com', 2000);
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('explains query plan', () => {
    const plan = explainQueryPlan(db, 'SELECT * FROM users WHERE name = ?', ['Alice']);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].detail).toBeDefined();
  });

  it('analyzes query plan', () => {
    const result = analyzeQueryPlan(db, 'SELECT * FROM users WHERE name = ?', ['Alice']);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(typeof result.hasFullTableScan).toBe('boolean');
    expect(typeof result.usesIndex).toBe('boolean');
  });

  it('detects index usage', () => {
    const usesIndex = planUsesIndex(
      db,
      'idx_users_name',
      'SELECT * FROM users WHERE name = ?',
      ['Alice']
    );
    expect(usesIndex).toBe(true);
  });

  it('detects plan detail', () => {
    const includes = planIncludesDetail(
      db,
      'USING INDEX',
      'SELECT * FROM users WHERE name = ?',
      ['Alice']
    );
    expect(includes).toBe(true);
  });

  it('detects full table scan', () => {
    const result = analyzeQueryPlan(db, 'SELECT * FROM users');
    expect(result.hasFullTableScan).toBe(true);
  });
});

describe('permissions', () => {
  let db: Database.Database;
  let pm: PermissionManager;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        data TEXT
      );
    `);
    pm = new PermissionManager(db);
  });

  afterEach(() => {
    db.close();
  });

  it('starts with admin role', () => {
    expect(pm.getCurrentRole()).toBe('admin');
    expect(pm.canSelect('users')).toBe(true);
    expect(pm.canInsert('users')).toBe(true);
    expect(pm.canUpdate('users')).toBe(true);
    expect(pm.canDelete('users')).toBe(true);
  });

  it('defines and switches roles', () => {
    const readerRole = createReaderRole(['users']);
    pm.defineRole(readerRole);
    pm.setRole('reader');
    expect(pm.getCurrentRole()).toBe('reader');
    expect(pm.canSelect('users')).toBe(true);
    expect(pm.canInsert('users')).toBe(false);
  });

  it('throws when switching to undefined role', () => {
    expect(() => pm.setRole('nonexistent')).toThrow(PermissionError);
  });

  it('creates writer role', () => {
    const writerRole = createWriterRole(['users']);
    pm.defineRole(writerRole);
    pm.setRole('writer');
    expect(pm.canSelect('users')).toBe(true);
    expect(pm.canInsert('users')).toBe(true);
    expect(pm.canUpdate('users')).toBe(true);
    expect(pm.canDelete('users')).toBe(false);
  });

  it('creates scoped role with row-level permissions', () => {
    const scopedRole = createScopedRole('user-1', 'id', 'user-1', ['users']);
    pm.defineRole(scopedRole);
    pm.setRole('user-1');
    const conditions = pm.getRowLevelConditions('users');
    expect(conditions.length).toBe(1);
    expect(conditions[0]).toContain("id = 'user-1'");
  });

  it('applies row-level filter to SQL', () => {
    const scopedRole = createScopedRole('user-1', 'id', 'user-1', ['users']);
    pm.defineRole(scopedRole);
    pm.setRole('user-1');
    const filtered = pm.applyRowLevelFilter('SELECT * FROM users', 'users');
    expect(filtered).toContain("WHERE id = 'user-1'");
  });

  it('appends row-level filter to existing WHERE', () => {
    const scopedRole = createScopedRole('user-1', 'id', 'user-1', ['users']);
    pm.defineRole(scopedRole);
    pm.setRole('user-1');
    const filtered = pm.applyRowLevelFilter('SELECT * FROM users WHERE name = ?', 'users');
    expect(filtered).toContain("WHERE (id = 'user-1') AND");
  });

  it('asserts permissions', () => {
    const readerRole = createReaderRole(['users']);
    pm.defineRole(readerRole);
    pm.setRole('reader');
    expect(() => pm.assertCanSelect('users')).not.toThrow();
    expect(() => pm.assertCanInsert('users')).toThrow(PermissionError);
  });

  it('lists all roles', () => {
    const readerRole = createReaderRole(['users']);
    pm.defineRole(readerRole);
    const roles = pm.listRoles();
    expect(roles).toContain('admin');
    expect(roles).toContain('reader');
  });

  it('gets role permissions', () => {
    const readerRole = createReaderRole(['users']);
    pm.defineRole(readerRole);
    const perms = pm.getRolePermissions('reader');
    expect(perms).toBeDefined();
    expect(perms?.role).toBe('reader');
    expect(pm.getRolePermissions('admin')?.role).toBe('admin');
    expect(pm.getRolePermissions('nonexistent')).toBeUndefined();
  });

  it('escapes single quotes in scope values', () => {
    const scopedRole = createScopedRole('test', 'name', "O'Brien", ['users']);
    pm.defineRole(scopedRole);
    pm.setRole('test');
    const conditions = pm.getRowLevelConditions('users');
    expect(conditions[0]).toContain("O''Brien");
  });
});

describe('openclaw-state-db', () => {
  it('opens state database and creates schema', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const database = openStateDatabase({ env });
    expect(database.db.open).toBe(true);
    expect(database.path).toContain('state.sqlite');
    expect(database.schemaVersion).toBeGreaterThan(0);
  });

  it('sets and gets state config', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    setStateConfig('test.key', { foo: 'bar' }, { env });
    const value = getStateConfig('test.key', { env });
    expect(value).toEqual({ foo: 'bar' });
  });

  it('returns null for missing config', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const value = getStateConfig('nonexistent', { env });
    expect(value).toBeNull();
  });

  it('sets and gets state cache', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    setStateCache('cache:key', 'value', undefined, { env });
    const cached = getStateCache('cache:key', { env });
    expect(cached).not.toBeNull();
    expect(cached?.value).toBe('value');
  });

  it('deletes state cache', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    setStateCache('cache:key', 'value', undefined, { env });
    const deleted = deleteStateCache('cache:key', { env });
    expect(deleted).toBe(true);
    expect(getStateCache('cache:key', { env })).toBeNull();
  });

  it('handles expired cache', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const past = Date.now() - 1000;
    setStateCache('cache:expired', 'value', past, { env });
    const cached = getStateCache('cache:expired', { env });
    expect(cached).toBeNull();
  });

  it('cleans up expired cache', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const past = Date.now() - 1000;
    setStateCache('a', '1', past, { env });
    setStateCache('b', '2', past, { env });
    setStateCache('c', '3', undefined, { env });
    const cleaned = cleanupExpiredCache({ env });
    expect(cleaned).toBe(2);
  });

  it('enqueues and dequeues items', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    enqueueItem('test-queue', 'item-1', { data: 'test' }, 0, { env });
    const item = dequeueItem('test-queue', 'worker-1', { env });
    expect(item).not.toBeNull();
    expect(item?.itemId).toBe('item-1');
    expect(item?.payload).toEqual({ data: 'test' });
  });

  it('returns null when queue is empty', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const item = dequeueItem('empty-queue', 'worker-1', { env });
    expect(item).toBeNull();
  });

  it('completes queue items', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    enqueueItem('test-queue', 'item-1', {}, 0, { env });
    dequeueItem('test-queue', 'worker-1', { env });
    const completed = completeQueueItem('test-queue', 'item-1', { env });
    expect(completed).toBe(true);
  });

  it('fails queue items', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    enqueueItem('test-queue', 'item-1', {}, 0, { env });
    dequeueItem('test-queue', 'worker-1', { env });
    const failed = failQueueItem('test-queue', 'item-1', 'error msg', { env });
    expect(failed).toBe(true);
  });

  it('gets queue stats', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    enqueueItem('test-queue', 'item-1', {}, 0, { env });
    enqueueItem('test-queue', 'item-2', {}, 0, { env });
    const stats = getQueueStats('test-queue', { env });
    expect(stats.pending).toBe(2);
  });

  it('respects priority in queue', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    enqueueItem('test-queue', 'low-priority', {}, 0, { env });
    enqueueItem('test-queue', 'high-priority', {}, 10, { env });
    const item = dequeueItem('test-queue', 'worker-1', { env });
    expect(item?.itemId).toBe('high-priority');
  });

  it('closes state database', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    openStateDatabase({ env });
    closeStateDatabaseForTest();
  });
});

describe('openclaw-agent-db', () => {
  it('opens agent database and creates schema', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const database = openAgentDatabase({ agentId: 'test-agent', env });
    expect(database.db.open).toBe(true);
    expect(database.agentId).toBe('test-agent');
    expect(database.schemaVersion).toBeGreaterThan(0);
  });

  it('creates and retrieves agent session', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    createAgentSession({
      agentId: 'test-agent',
      sessionId: 'sess-1',
      sessionKey: 'agent:test-agent:sess-1',
      title: 'Test Session',
      model: 'gpt-4',
      env,
    });
    const session = getAgentSession({ agentId: 'test-agent', sessionId: 'sess-1', env });
    expect(session).not.toBeNull();
    expect(session?.title).toBe('Test Session');
    expect(session?.model).toBe('gpt-4');
    expect(session?.status).toBe('active');
  });

  it('lists agent sessions', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    createAgentSession({
      agentId: 'test-agent',
      sessionId: 'sess-1',
      sessionKey: 'key-1',
      env,
    });
    createAgentSession({
      agentId: 'test-agent',
      sessionId: 'sess-2',
      sessionKey: 'key-2',
      env,
    });
    const sessions = listAgentSessions({ agentId: 'test-agent', env });
    expect(sessions.length).toBe(2);
  });

  it('adds and retrieves messages', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    createAgentSession({
      agentId: 'test-agent',
      sessionId: 'sess-1',
      sessionKey: 'key-1',
      env,
    });
    addAgentMessage({
      agentId: 'test-agent',
      messageId: 'msg-1',
      sessionId: 'sess-1',
      role: 'user',
      content: 'Hello',
      env,
    });
    addAgentMessage({
      agentId: 'test-agent',
      messageId: 'msg-2',
      sessionId: 'sess-1',
      role: 'assistant',
      content: 'Hi there!',
      env,
    });
    const messages = getAgentMessages({ agentId: 'test-agent', sessionId: 'sess-1', env });
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('records and completes tool calls', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    createAgentSession({
      agentId: 'test-agent',
      sessionId: 'sess-1',
      sessionKey: 'key-1',
      env,
    });
    recordToolCall({
      agentId: 'test-agent',
      toolCallId: 'tool-1',
      sessionId: 'sess-1',
      toolName: 'test_tool',
      arguments: { input: 'value' },
      env,
    });
    completeToolCall({
      agentId: 'test-agent',
      toolCallId: 'tool-1',
      result: { output: 'result' },
      env,
    });
    const { db } = openAgentDatabase({ agentId: 'test-agent', env });
    const row = db
      .prepare('SELECT status, result_json FROM agent_tool_calls WHERE tool_call_id = ?')
      .get('tool-1') as { status: string; result_json: string };
    expect(row.status).toBe('completed');
    expect(JSON.parse(row.result_json)).toEqual({ output: 'result' });
  });

  it('records failed tool calls', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    createAgentSession({
      agentId: 'test-agent',
      sessionId: 'sess-1',
      sessionKey: 'key-1',
      env,
    });
    recordToolCall({
      agentId: 'test-agent',
      toolCallId: 'tool-1',
      sessionId: 'sess-1',
      toolName: 'test_tool',
      env,
    });
    completeToolCall({
      agentId: 'test-agent',
      toolCallId: 'tool-1',
      error: 'something went wrong',
      env,
    });
    const { db } = openAgentDatabase({ agentId: 'test-agent', env });
    const row = db
      .prepare('SELECT status, error FROM agent_tool_calls WHERE tool_call_id = ?')
      .get('tool-1') as { status: string; error: string };
    expect(row.status).toBe('failed');
    expect(row.error).toBe('something went wrong');
  });

  it('sets and gets agent cache', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    setAgentCache({
      agentId: 'test-agent',
      scope: 'test-scope',
      key: 'key-1',
      value: { foo: 'bar' },
      env,
    });
    const cached = getAgentCache({
      agentId: 'test-agent',
      scope: 'test-scope',
      key: 'key-1',
      env,
    });
    expect(cached).not.toBeNull();
    expect(cached?.value).toEqual({ foo: 'bar' });
  });

  it('deletes agent cache', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    setAgentCache({
      agentId: 'test-agent',
      scope: 'test-scope',
      key: 'key-1',
      value: 'test',
      env,
    });
    const deleted = deleteAgentCache({
      agentId: 'test-agent',
      scope: 'test-scope',
      key: 'key-1',
      env,
    });
    expect(deleted).toBe(true);
    const cached = getAgentCache({
      agentId: 'test-agent',
      scope: 'test-scope',
      key: 'key-1',
      env,
    });
    expect(cached).toBeNull();
  });

  it('normalizes agent id', () => {
    const tempDir = createTempDir();
    const env = createTestEnv(tempDir);
    const database = openAgentDatabase({ agentId: 'Test Agent!', env });
    expect(database.agentId).toBe('test-agent');
  });
});
