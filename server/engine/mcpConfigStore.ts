/**
 * McpConfigStore — MCP Server 配置持久化（SQLite）
 *
 * DB 路径：~/.cdf-know-clow/mcp/mcp_servers.db
 * 表：mcp_servers（字段对应 McpServerConfig）
 * env 字段使用 base64 编码存储（MVP 非安全加密）
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { McpServerConfig, McpTransportType } from './mcpTypes.js';

const MCP_DB_DIR = path.join(os.homedir(), '.cdf-know-clow', 'mcp');
const MCP_DB_PATH = path.join(MCP_DB_DIR, 'mcp_servers.db');

let db: Database.Database | null = null;

/** 确保 DB 目录存在 */
function ensureDbDir(): void {
  if (!fs.existsSync(MCP_DB_DIR)) {
    fs.mkdirSync(MCP_DB_DIR, { recursive: true });
  }
}

/** 获取/创建 DB 实例 */
function getDb(): Database.Database {
  if (db) return db;
  ensureDbDir();
  db = new Database(MCP_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]',
      env TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      transportType TEXT NOT NULL DEFAULT 'stdio',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
  `);

  return db;
}

/** Base64 编码 env 字段 */
function encodeEnv(env: Record<string, string>): string {
  return Buffer.from(JSON.stringify(env), 'utf8').toString('base64');
}

/** Base64 解码 env 字段 */
function decodeEnv(encoded: string): Record<string, string> {
  try {
    // 先尝试 base64 解码
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    // 兼容：可能直接就是 JSON
    try {
      return JSON.parse(encoded);
    } catch {
      return {};
    }
  }
}

/** 将 DB 行转换为 McpServerConfig */
function rowToConfig(row: Record<string, unknown>): McpServerConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    command: row.command as string,
    args: JSON.parse((row.args as string) || '[]'),
    env: decodeEnv((row.env as string) || '{}'),
    enabled: (row.enabled as number) === 1,
    transportType: (row.transportType as string) as McpTransportType,
    createdAt: row.createdAt as number,
    updatedAt: row.updatedAt as number,
  };
}

/**
 * 添加 MCP Server 配置。
 *
 * @param input - 不含 id/timestamp 的配置
 * @returns 完整的 McpServerConfig
 */
export function addServer(input: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
  const database = getDb();
  const now = Date.now();
  const config: McpServerConfig = {
    ...input,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  };

  database.prepare(`
    INSERT INTO mcp_servers (id, name, command, args, env, enabled, transportType, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    config.id,
    config.name,
    config.command,
    JSON.stringify(config.args),
    encodeEnv(config.env),
    config.enabled ? 1 : 0,
    config.transportType,
    config.createdAt,
    config.updatedAt,
  );

  return config;
}

/**
 * 获取单个 MCP Server 配置。
 *
 * @param id - Server ID
 * @returns McpServerConfig 或 undefined
 */
export function getServer(id: string): McpServerConfig | undefined {
  const database = getDb();
  const row = database.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToConfig(row) : undefined;
}

/**
 * 更新 MCP Server 配置。
 *
 * @param id - Server ID
 * @param updates - 要更新的字段（部分更新）
 * @returns 更新后的 McpServerConfig 或 undefined
 */
export function updateServer(id: string, updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt'>>): McpServerConfig | undefined {
  const database = getDb();
  const existing = getServer(id);
  if (!existing) return undefined;

  const merged: McpServerConfig = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };

  database.prepare(`
    UPDATE mcp_servers
    SET name = ?, command = ?, args = ?, env = ?, enabled = ?, transportType = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    merged.name,
    merged.command,
    JSON.stringify(merged.args),
    encodeEnv(merged.env),
    merged.enabled ? 1 : 0,
    merged.transportType,
    merged.updatedAt,
    id,
  );

  return merged;
}

/**
 * 删除 MCP Server 配置。
 *
 * @param id - Server ID
 * @returns 是否删除成功
 */
export function deleteServer(id: string): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * 列出所有 MCP Server 配置。
 *
 * @param enabledOnly - 是否只返回启用的 Server
 * @returns McpServerConfig 数组
 */
export function listServers(enabledOnly: boolean = false): McpServerConfig[] {
  const database = getDb();
  const rows = enabledOnly
    ? database.prepare('SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY createdAt ASC').all() as Record<string, unknown>[]
    : database.prepare('SELECT * FROM mcp_servers ORDER BY createdAt ASC').all() as Record<string, unknown>[];
  return rows.map(rowToConfig);
}
