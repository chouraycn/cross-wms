/**
 * MCP Config Store
 *
 * v9.0: 改为使用 SQLiteEngine 封装独立数据库（mcp_servers.db）
 * - 保留独立数据库设计（MCP 配置是系统状态，适合 SQLite）
 * - 使用 SQLiteEngine 替代直接的 better-sqlite3 调用
 * - 兼容 mcpTypes.ts 中的 McpServerConfig 类型
 */

import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { SQLiteEngine } from '../storage/SQLiteEngine.js';
import { logger } from '../logger.js';
import type { McpServerConfig, McpTransportType } from './mcpTypes.js';

// ===================== 常量定义 =====================

const MCP_DIR = path.join(os.homedir(), '.cdf-know-clow', 'mcp');
const DB_PATH = path.join(MCP_DIR, 'mcp_servers.db');

// ===================== 数据库初始化 =====================

let engine: SQLiteEngine | null = null;

function ensureEngine(): SQLiteEngine {
  if (!engine) {
    engine = new SQLiteEngine(DB_PATH);
    engine.connect().catch((err) => {
      logger.error('[MCPStore] 数据库连接失败:', err);
    });
  }
  return engine;
}

// 立即初始化
ensureEngine();

// ===================== 建表迁移 =====================

function initSchema(): void {
  const db = ensureEngine();
  db.migrate('1.0.0', `
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id          TEXT PRIMARY KEY,
      name        TEXT    NOT NULL UNIQUE,
      command     TEXT    NOT NULL,
      args        TEXT,               -- JSON array
      env         TEXT,               -- JSON object
      enabled     INTEGER NOT NULL DEFAULT 1,
      transport_type TEXT NOT NULL DEFAULT 'stdio',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_server_tools (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id   TEXT    NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      description TEXT,
      input_schema TEXT,              -- JSON schema
      UNIQUE(server_id, name)
    );
  `);
}

// 延迟执行建表，确保 engine 已连接
setTimeout(() => {
  try {
    initSchema();
  } catch (err) {
    logger.error('[MCPStore] 初始化 schema 失败:', err);
  }
}, 0);

// ===================== 序列化/反序列化 =====================

function rowToConfig(row: Record<string, unknown>): McpServerConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    command: row.command as string,
    args: row.args ? JSON.parse(row.args as string) : [],
    env: row.env ? JSON.parse(row.env as string) : {},
    enabled: Boolean(row.enabled),
    transportType: (row.transport_type as McpTransportType) || 'stdio',
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function configToRow(config: Partial<McpServerConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (config.name !== undefined) row.name = config.name;
  if (config.command !== undefined) row.command = config.command;
  if (config.args !== undefined) row.args = JSON.stringify(config.args);
  if (config.env !== undefined) row.env = JSON.stringify(config.env);
  if (config.enabled !== undefined) row.enabled = config.enabled ? 1 : 0;
  if (config.transportType !== undefined) row.transport_type = config.transportType;
  if (config.createdAt !== undefined) row.created_at = config.createdAt;
  if (config.updatedAt !== undefined) row.updated_at = config.updatedAt;
  return row;
}

// ===================== 服务器 CRUD =====================

/** 添加 Server（兼容旧 API） */
export function addServer(config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
  const db = ensureEngine();
  const now = Date.now();
  const id = uuidv4();

  db.run(
    `INSERT INTO mcp_servers (id, name, command, args, env, enabled, transport_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      config.name,
      config.command,
      JSON.stringify(config.args || []),
      JSON.stringify(config.env || {}),
      config.enabled !== false ? 1 : 0,
      config.transportType || 'stdio',
      now,
      now,
    ]
  );

  return {
    id,
    name: config.name,
    command: config.command,
    args: config.args || [],
    env: config.env || {},
    enabled: config.enabled !== false,
    transportType: config.transportType || 'stdio',
    createdAt: now,
    updatedAt: now,
  };
}

/** 获取 Server（兼容旧 API，按 ID 或 name） */
export function getServer(idOrName: string): McpServerConfig | undefined {
  const db = ensureEngine();

  // 先尝试按 ID 查询
  let row = db.get<Record<string, unknown>>(
    'SELECT * FROM mcp_servers WHERE id = ?',
    [idOrName]
  );

  // 再尝试按 name 查询
  if (!row) {
    row = db.get<Record<string, unknown>>(
      'SELECT * FROM mcp_servers WHERE name = ?',
      [idOrName]
    );
  }

  return row ? rowToConfig(row) : undefined;
}

/** 更新 Server */
export function updateServer(id: string, updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt'>>): McpServerConfig | undefined {
  const db = ensureEngine();

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.command !== undefined) {
    sets.push('command = ?');
    params.push(updates.command);
  }
  if (updates.args !== undefined) {
    sets.push('args = ?');
    params.push(JSON.stringify(updates.args));
  }
  if (updates.env !== undefined) {
    sets.push('env = ?');
    params.push(JSON.stringify(updates.env));
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }
  if (updates.transportType !== undefined) {
    sets.push('transport_type = ?');
    params.push(updates.transportType);
  }

  if (sets.length === 0) return getServer(id);

  const now = Date.now();
  sets.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const result = db.run(
    `UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = ?`,
    params
  );

  if (result.changes === 0) return undefined;

  return getServer(id);
}

/** 删除 Server */
export function deleteServer(id: string): boolean {
  const db = ensureEngine();
  const result = db.run('DELETE FROM mcp_servers WHERE id = ?', [id]);
  return result.changes > 0;
}

/** 列出所有 Server */
export function listServers(enabledOnly: boolean = false): McpServerConfig[] {
  const db = ensureEngine();

  if (enabledOnly) {
    const rows = db.all<Record<string, unknown>>(
      'SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY created_at DESC'
    );
    return rows.map(rowToConfig);
  }

  const rows = db.all<Record<string, unknown>>(
    'SELECT * FROM mcp_servers ORDER BY created_at DESC'
  );
  return rows.map(rowToConfig);
}

// ===================== 工具 CRUD =====================

export function listTools(serverId?: string): Array<{
  id: number;
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}> {
  const db = ensureEngine();
  if (serverId !== undefined) {
    const rows = db.all<Record<string, unknown>>(
      'SELECT * FROM mcp_server_tools WHERE server_id = ? ORDER BY name',
      [serverId]
    );
    return rows.map((row) => ({
      id: row.id as number,
      serverId: row.server_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      inputSchema: row.input_schema ? JSON.parse(row.input_schema as string) : undefined,
    }));
  }
  const rows = db.all<Record<string, unknown>>(
    'SELECT * FROM mcp_server_tools ORDER BY name'
  );
  return rows.map((row) => ({
    id: row.id as number,
    serverId: row.server_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    inputSchema: row.input_schema ? JSON.parse(row.input_schema as string) : undefined,
  }));
}

export function createTool(config: {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}): number {
  const db = ensureEngine();
  const result = db.run(
    `INSERT INTO mcp_server_tools (server_id, name, description, input_schema)
     VALUES (?, ?, ?, ?)`,
    [
      config.serverId,
      config.name,
      config.description ?? null,
      config.inputSchema ? JSON.stringify(config.inputSchema) : null,
    ]
  );
  return Number(result.lastInsertRowid);
}

export function deleteTool(id: number): boolean {
  const db = ensureEngine();
  const result = db.run('DELETE FROM mcp_server_tools WHERE id = ?', [id]);
  return result.changes > 0;
}
