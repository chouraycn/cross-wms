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
}
