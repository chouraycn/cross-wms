import Database from 'better-sqlite3';
import { logger } from './logger.js';

// ===================== Chat Session Types =====================

/** 会话状态 */
export type SessionStatus = 'active' | 'archived' | 'daily_reset';

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** v6.0: 会话状态（active/archived/daily_reset） */
  status?: SessionStatus;
  /** v6.0: 最后活跃时间（用于空闲归档检测） */
  lastActiveAt?: string;
  /** v6.0: 归档时间 */
  archivedAt?: string | null;
  /** v6.0: 父会话 ID（子任务自动创建子会话） */
  parentSessionId?: string | null;
  /** v6.0: 会话日期键（YYYY-MM-DD，用于每日重置） */
  sessionDate?: string;
  /** v6.0: 会话标签（JSON 数组，用于归档搜索） */
  tags?: string | null;
  /** v6.0: 摘要（归档时自动生成） */
  summary?: string | null;
  /** v6.0: 消息数量 */
  messageCount?: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
  toolCalls?: string;
  skillId?: string | null; // 关联的技能 ID
  thinking?: string | null;
  thinkingDuration?: number | null;
  attachments?: string | null; // JSON 序列化的附件数组
}

export interface MessageReaction {
  id: string;
  messageId: string;
  emoji: string;
  userId?: string | null;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  type: string;
  url: string;
  name?: string | null;
  size?: number | null;
  mimeType?: string | null;
  createdAt: string;
}

export interface MessageEdit {
  id: string;
  messageId: string;
  oldContent: string;
  newContent: string;
  editedAt: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category?: string | null;
  tags?: string | null; // JSON 数组
  isBuiltin?: number; // 0 or 1
  createdAt: string;
  updatedAt: string;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args?: string | null; // JSON 数组
  env?: string | null; // JSON 对象
  enabled?: number; // 0 or 1
  transportType?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingsRow {
  key: string;
  value: string; // JSON string
}

// ===================== Chat Table Initialization =====================

export function initChatTables(db: Database.Database): void {
  // Existing chat tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      agentId TEXT,
      folderId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      timestamp TEXT NOT NULL,
      toolCalls TEXT,
      skillId TEXT DEFAULT NULL,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE
    );
  `);

  // Message reactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      emoji TEXT NOT NULL,
      userId TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_message_reactions_messageId ON message_reactions(messageId);
  `);

  // Message attachments
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      name TEXT,
      size INTEGER,
      mimeType TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_message_attachments_messageId ON message_attachments(messageId);
  `);

  // Message edits
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_edits (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      oldContent TEXT NOT NULL,
      newContent TEXT NOT NULL,
      editedAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_message_edits_messageId ON message_edits(messageId);
  `);

  // App settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Prompt templates
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      isBuiltin INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
    CREATE INDEX IF NOT EXISTS idx_prompt_templates_builtin ON prompt_templates(isBuiltin);
  `);

  // MCP servers
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      args TEXT,
      env TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      transportType TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
  `);

  // v1.9.3: Add folderId column to sessions if missing (idempotent migration)
  try {
    const folderIdColExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='folderId'`).get() as { cnt: number };
    if (folderIdColExists.cnt === 0) {
      db.exec(`ALTER TABLE sessions ADD COLUMN folderId TEXT`);
      logger.info('[Migrate v1.9.3] 添加 folderId 列到 sessions 表');
    }
  } catch (e) {
    logger.warn('[Migrate v1.9.3] 添加 folderId 列失败（可能表不存在）:', e);
  }

  // v1.9.3: Add agentId column to sessions if missing (idempotent migration)
  try {
    const agentIdColExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='agentId'`).get() as { cnt: number };
    if (agentIdColExists.cnt === 0) {
      db.exec(`ALTER TABLE sessions ADD COLUMN agentId TEXT`);
      logger.info('[Migrate v1.9.3] 添加 agentId 列到 sessions 表');
    }
  } catch (e) {
    logger.warn('[Migrate v1.9.3] 添加 agentId 列失败（可能表不存在）:', e);
  }

  // Add skillId column to messages table (v1.0.94) — 幂等迁移
  const messagesSkillIdExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('messages') WHERE name='skillId'`).get() as { cnt: number };
  if (messagesSkillIdExists.cnt === 0) {
    db.exec(`ALTER TABLE messages ADD COLUMN skillId TEXT DEFAULT NULL`);
  }

  // Add thinking columns to messages table — 幂等迁移
  const thinkingColumns: Array<{ column: string; definition: string }> = [
    { column: 'thinking', definition: 'TEXT' },
    { column: 'thinkingDuration', definition: 'INTEGER' },
    { column: 'attachments', definition: 'TEXT' },
  ];
  for (const { column, definition } of thinkingColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('messages') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
    }
  }

  // ===================== v6.0: Session Lifecycle Columns =====================
  const sessionLifecycleColumns: Array<{ column: string; definition: string }> = [
    { column: 'status', definition: "TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','daily_reset'))" },
    { column: 'lastActiveAt', definition: 'TEXT' },
    { column: 'archivedAt', definition: 'TEXT' },
    { column: 'parentSessionId', definition: 'TEXT' },
    { column: 'sessionDate', definition: 'TEXT' },
    { column: 'tags', definition: "TEXT DEFAULT '[]'" },
    { column: 'summary', definition: 'TEXT' },
  ];
  for (const { column, definition } of sessionLifecycleColumns) {
    try {
      const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='${column}'`).get() as { cnt: number };
      if (colExists.cnt === 0) {
        db.exec(`ALTER TABLE sessions ADD COLUMN ${column} ${definition}`);
        logger.info(`[Migrate v6.0] 添加 ${column} 列到 sessions 表`);
      }
    } catch (e) {
      logger.warn(`[Migrate v6.0] 添加 ${column} 列失败:`, e);
    }
  }

  // v6.0: 为 sessions 表添加索引（生命周期查询优化）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_sessionDate ON sessions(sessionDate);
    CREATE INDEX IF NOT EXISTS idx_sessions_parentSessionId ON sessions(parentSessionId);
    CREATE INDEX IF NOT EXISTS idx_sessions_lastActiveAt ON sessions(lastActiveAt);
  `);

  // v6.0: 将现有会话补充 lastActiveAt 和 sessionDate（一次性迁移）
  const lifecycleMigrationKey = 'migration_v6.0_session_lifecycle';
  const lifecycleMigrationExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(lifecycleMigrationKey) as { value: string } | undefined;
  if (!lifecycleMigrationExists) {
    logger.info('[Migrate v6.0] 补充现有会话的 lastActiveAt / sessionDate...');
    db.exec(`
      UPDATE sessions SET
        lastActiveAt = COALESCE(lastActiveAt, updatedAt, createdAt),
        sessionDate = COALESCE(sessionDate, DATE(COALESCE(updatedAt, createdAt)))
      WHERE lastActiveAt IS NULL OR sessionDate IS NULL
    `);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      lifecycleMigrationKey,
      JSON.stringify({ migratedAt: new Date().toISOString() })
    );
    logger.info('[Migrate v6.0] 会话生命周期字段迁移完成');
  }
}
