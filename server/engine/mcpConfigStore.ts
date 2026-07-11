/**
 * MCP Config Store
 *
 * v9.0: 改为使用 SQLiteEngine 封装独立数据库（mcp_servers.db）
 * - 保留独立数据库设计（MCP 配置是系统状态，适合 SQLite）
 * - 使用 SQLiteEngine 替代直接的 better-sqlite3 调用
 * - 兼容 mcpTypes.ts 中的 McpServerConfig 类型
 *
 * v10.0: 合并入主库 chat.db，使用 DatabaseManager 统一管理
 * - 不再使用独立 mcp_servers.db
 * - 通过 DatabaseManager.getMainDb() 获取主库连接
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { DatabaseManager } from '../storage/databaseManager.js';
import type { McpServerConfig, McpTransportType } from './mcpTypes.js';

// ===================== 数据库访问 =====================

function getDb() {
  return DatabaseManager.getMainDb();
}

// ===================== 建表迁移 =====================

function migrateOldColumnNames(): void {
  const db = getDb();
  try {
    const columns = db.pragma('table_info(mcp_servers)') as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);
    
    const hasOldCamelCase = 
      colNames.includes('createdAt') || 
      colNames.includes('updatedAt') || 
      colNames.includes('transportType');
    
    const hasNewSnakeCase = 
      colNames.includes('created_at') || 
      colNames.includes('updated_at') || 
      colNames.includes('transport_type');
    
    if (!hasOldCamelCase || hasNewSnakeCase) return;
    
    logger.info('[MCPStore] 检测到旧列名（驼峰命名），开始迁移到下划线命名...');
    
    const hasTransportType = colNames.includes('transportType');
    const hasCreatedAt = colNames.includes('createdAt');
    const hasUpdatedAt = colNames.includes('updatedAt');
    
    const newTableCols = ['id', 'name', 'command', 'args', 'env', 'enabled', 'transport_type', 'created_at', 'updated_at'];
    const selectExprs: string[] = [
      'id', 'name', 'command', 'args', 'env', 'enabled',
    ];
    
    if (hasTransportType) {
      selectExprs.push('transportType AS transport_type');
    } else {
      selectExprs.push("'stdio' AS transport_type");
    }
    
    if (hasCreatedAt) {
      selectExprs.push('createdAt AS created_at');
    } else {
      selectExprs.push('0 AS created_at');
    }
    
    if (hasUpdatedAt) {
      selectExprs.push('updatedAt AS updated_at');
    } else {
      selectExprs.push('0 AS updated_at');
    }
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers_new (
        id          TEXT PRIMARY KEY,
        name        TEXT    NOT NULL UNIQUE,
        command     TEXT    NOT NULL,
        args        TEXT,
        env         TEXT,
        enabled     INTEGER NOT NULL DEFAULT 1,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      
      INSERT INTO mcp_servers_new (${newTableCols.join(', ')})
      SELECT ${selectExprs.join(', ')}
      FROM mcp_servers;
      
      DROP TABLE mcp_servers;
      ALTER TABLE mcp_servers_new RENAME TO mcp_servers;
    `);
    
    logger.info('[MCPStore] 列名迁移完成');
  } catch (e) {
    logger.error('[MCPStore] 列名迁移失败:', e);
  }
}

function initSchema(): void {
  const db = getDb();

  // 先尝试迁移旧列名
  try {
    migrateOldColumnNames();
  } catch (e) {
    logger.warn('[MCPStore] 迁移旧列名跳过:', e);
  }

  // 建表（IF NOT EXISTS 保证幂等）
  db.exec(`
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

  // 增量列迁移：为 sse / http 传输添加 url 和 headers 列
  try {
    const cols = db.pragma('table_info(mcp_servers)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('url')) {
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN url TEXT`);
    }
    if (!colNames.includes('headers')) {
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN headers TEXT`); // JSON object
    }
  } catch (e) {
    logger.warn('[MCPStore] 添加 url/headers 列失败（可能已存在）:', e);
  }

  // 版本标记
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mcp_schema_version', ?)`).run('1.1.0');
}

// 延迟执行建表
setTimeout(() => {
  try {
    initSchema();
  } catch (err) {
    logger.error('[MCPStore] 初始化 schema 失败:', err);
  }
}, 0);

// ===================== 序列化/反序列化 =====================

function rowToConfig(row: Record<string, unknown>): McpServerConfig {
  const envRaw = row.env as string;
  let env: Record<string, string> = {};
  if (envRaw) {
    try {
      env = JSON.parse(envRaw);
    } catch {
      try {
        const decoded = Buffer.from(envRaw, 'base64').toString('utf8');
        env = JSON.parse(decoded);
      } catch {
        env = {};
      }
    }
  }

  const argsRaw = row.args as string;
  let args: string[] = [];
  if (argsRaw) {
    try {
      args = JSON.parse(argsRaw);
    } catch {
      try {
        const decoded = Buffer.from(argsRaw, 'base64').toString('utf8');
        args = JSON.parse(decoded);
      } catch {
        args = [];
      }
    }
  }

  const headersRaw = row.headers as string | undefined;
  let headers: Record<string, string> | undefined;
  if (headersRaw) {
    try {
      headers = JSON.parse(headersRaw);
    } catch {
      headers = undefined;
    }
  }

  return {
    id: row.id as string,
    name: row.name as string,
    command: row.command as string,
    args,
    env,
    enabled: Boolean(row.enabled),
    transportType: ((row.transport_type || row.transportType) as McpTransportType) || 'stdio',
    url: (row.url as string | undefined) || undefined,
    headers,
    createdAt: (row.created_at || row.createdAt) as number,
    updatedAt: (row.updated_at || row.updatedAt) as number,
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
  if (config.url !== undefined) row.url = config.url;
  if (config.headers !== undefined) row.headers = JSON.stringify(config.headers);
  if (config.createdAt !== undefined) row.created_at = config.createdAt;
  if (config.updatedAt !== undefined) row.updated_at = config.updatedAt;
  return row;
}

// ===================== 服务器 CRUD =====================

/** 添加 Server（兼容旧 API） */
export function addServer(config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();
  const transportType = config.transportType || 'stdio';
  // command 列为 NOT NULL；sse/http 无命令时存空串占位
  const command = config.command || '';

  db.prepare(
    `INSERT INTO mcp_servers (id, name, command, args, env, enabled, transport_type, url, headers, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    config.name,
    command,
    JSON.stringify(config.args || []),
    JSON.stringify(config.env || {}),
    config.enabled !== false ? 1 : 0,
    transportType,
    config.url || null,
    config.headers ? JSON.stringify(config.headers) : null,
    now,
    now,
  );

  return {
    id,
    name: config.name,
    command,
    args: config.args || [],
    env: config.env || {},
    enabled: config.enabled !== false,
    transportType,
    url: config.url,
    headers: config.headers,
    createdAt: now,
    updatedAt: now,
  };
}

/** 获取 Server（兼容旧 API，按 ID 或 name） */
export function getServer(idOrName: string): McpServerConfig | undefined {
  const db = getDb();

  // 先尝试按 ID 查询
  let row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(idOrName) as Record<string, unknown> | undefined;

  // 再尝试按 name 查询
  if (!row) {
    row = db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(idOrName) as Record<string, unknown> | undefined;
  }

  return row ? rowToConfig(row) : undefined;
}

/** 更新 Server */
export function updateServer(id: string, updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt'>>): McpServerConfig | undefined {
  const db = getDb();

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
  if (updates.url !== undefined) {
    sets.push('url = ?');
    params.push(updates.url);
  }
  if (updates.headers !== undefined) {
    sets.push('headers = ?');
    params.push(JSON.stringify(updates.headers));
  }

  if (sets.length === 0) return getServer(id);

  const now = Date.now();
  sets.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const result = db.prepare(
    `UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = ?`
  ).run(...params);

  if (result.changes === 0) return undefined;

  return getServer(id);
}

/** 删除 Server */
export function deleteServer(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 列出所有 Server */
export function listServers(enabledOnly: boolean = false): McpServerConfig[] {
  const db = getDb();

  if (enabledOnly) {
    const rows = db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(rowToConfig);
  }

  const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as Record<string, unknown>[];
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
  const db = getDb();
  if (serverId !== undefined) {
    const rows = db.prepare('SELECT * FROM mcp_server_tools WHERE server_id = ? ORDER BY name').all(serverId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as number,
      serverId: row.server_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      inputSchema: row.input_schema ? JSON.parse(row.input_schema as string) : undefined,
    }));
  }
  const rows = db.prepare('SELECT * FROM mcp_server_tools ORDER BY name').all() as Record<string, unknown>[];
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
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO mcp_server_tools (server_id, name, description, input_schema)
     VALUES (?, ?, ?, ?)`
  ).run(
    config.serverId,
    config.name,
    config.description ?? null,
    config.inputSchema ? JSON.stringify(config.inputSchema) : null,
  );
  return Number(result.lastInsertRowid);
}

export function deleteTool(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM mcp_server_tools WHERE id = ?').run(id);
  return result.changes > 0;
}
